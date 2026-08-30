import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import type { Browser } from 'puppeteer';
import puppeteer from 'puppeteer';

import { uploadDir, UPLOAD_URL_PATH } from '../../config/env.js';
import { FONTS_DIR, FONTS_URL_PATH } from '../render-assets.js';

/**
 * Puppeteer browser pool (backlog 4.3.2). PDF generation is the app's heaviest
 * operation, so:
 *
 *  - **one** Chrome instance for the whole process, launched lazily on the first
 *    render and relaunched automatically if it crashes / disconnects;
 *  - a fixed concurrency cap (`MAX_CONCURRENCY`) with a FIFO queue — extra
 *    requests wait rather than spawning unbounded tabs and OOM-ing the box;
 *  - a hard per-render timeout so one wedged render can't hold a slot forever.
 *
 * The rendered HTML is fully self-contained except for `/fonts/*` (self-hosted
 * Noto, backlog 3.1.6) and an optional `/uploads/*` logo. Those are served from
 * disk via request interception — no real network, so `networkidle0` settles fast
 * and a render can't reach anything it shouldn't.
 */

const MAX_CONCURRENCY = 2;
const RENDER_TIMEOUT_MS = 20_000;

export class PdfTimeoutError extends Error {
  constructor() {
    super('PDF generation timed out.');
    this.name = 'PdfTimeoutError';
  }
}

export interface RenderPdfOptions {
  /** Passed straight to `page.pdf`; the shared renderer already emits `@page`
   * rules, so `preferCSSPageSize` is what actually sizes the document. */
  landscape?: boolean;
}

let browserPromise: Promise<Browser> | null = null;
let active = 0;
const waiters: Array<() => void> = [];

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        // --no-sandbox is required on most VPS images (no user namespaces). Safe
        // here only because we render our own trusted HTML, never third-party pages.
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      })
      .then((browser) => {
        browser.on('disconnected', () => {
          browserPromise = null;
        });
        return browser;
      })
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
}

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENCY) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  active -= 1;
  const next = waiters.shift();
  if (next) next();
}

const ASSET_ROOTS: Array<{ prefix: string; dir: string }> = [
  { prefix: `${FONTS_URL_PATH}/`, dir: FONTS_DIR },
  { prefix: `${UPLOAD_URL_PATH}/`, dir: uploadDir },
];

const CONTENT_TYPE: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/**
 * Render a complete HTML document (from the shared `renderInvoice`, `media:
 * 'print'`) to a PDF buffer. Serialised behind the concurrency cap; rejects with
 * `PdfTimeoutError` if it exceeds `RENDER_TIMEOUT_MS`.
 */
export async function renderHtmlToPdf(
  html: string,
  options: RenderPdfOptions = {},
): Promise<Buffer> {
  await acquireSlot();
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:') || url === 'about:blank') {
        void request.continue();
        return;
      }
      const { pathname } = new URL(url);
      const match = ASSET_ROOTS.find((root) => pathname.startsWith(root.prefix));
      if (!match) {
        // The document is self-contained; nothing else is expected.
        void request.abort();
        return;
      }
      const file = join(match.dir, basename(pathname));
      readFile(file).then(
        (body) =>
          request.respond({
            status: 200,
            contentType: CONTENT_TYPE[extname(file).toLowerCase()] ?? 'application/octet-stream',
            body,
          }),
        () => request.abort(),
      );
    });

    const pdf = await Promise.race([
      (async () => {
        // Fonts come from disk via interception (instant), so `load` is enough;
        // then wait for `document.fonts` so no glyph falls back mid-paint. String
        // form because this runs in the page, not Node (no DOM lib here).
        await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
        await page.evaluate('document.fonts ? document.fonts.ready : null');
        return page.pdf({
          printBackground: true,
          preferCSSPageSize: true,
          landscape: options.landscape ?? false,
        });
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new PdfTimeoutError()), RENDER_TIMEOUT_MS),
      ),
    ]);

    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
    releaseSlot();
  }
}

/** For graceful shutdown / tests. */
export async function closeBrowserPool(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close().catch(() => undefined);
}
