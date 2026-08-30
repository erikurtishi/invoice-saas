/**
 * Render + font check (backlog 3.1.6): "verify Macedonian renders correctly in
 * every template". Runs the real shared renderer over every preset, in every
 * invoice language, produces a PDF via the same Puppeteer path the Phase 4
 * pipeline will use, and extracts the text back out to confirm Cyrillic and
 * Albanian survive the round trip as real, selectable text (decision D10 — visual
 * inspection cannot catch the ToUnicode corruption this guards against).
 *
 *   node apps/api/scripts/render-check.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';

import puppeteer from 'puppeteer';

import { renderInvoice, sampleInvoiceData, TEMPLATE_PRESETS } from '@invoice-saas/shared';

const require = createRequire(import.meta.url);
// Same resolution as apps/api/src/lib/render-assets.ts.
const FONTS_DIR = join(
  dirname(require.resolve('@invoice-saas/shared/package.json')),
  'assets',
  'fonts',
);

const ASSET_BASE = 'http://render-check.local';

// Strings that MUST come back out of the PDF intact, per language.
const NEEDLES = {
  EN: ['Invoice', 'Brand identity design', 'Amount due'],
  SQ: ['Faturë', 'Dizajn i identitetit të markës', 'Shuma për pagesë'],
  MK: ['Фактура', 'Дизајн на бренд идентитет', 'Износ за плаќање'],
};

async function extractText(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: false }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join('');
  }
  return { text, pages: doc.numPages };
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

let failures = 0;
let combos = 0;
const t0 = performance.now();

try {
  for (const preset of TEMPLATE_PRESETS) {
    for (const language of ['EN', 'SQ', 'MK']) {
      combos += 1;
      const data = sampleInvoiceData({ language });
      const { html } = renderInvoice(preset.config, data, {
        media: 'print',
        assetBaseUrl: ASSET_BASE,
      });

      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = new URL(req.url());
        if (url.pathname.startsWith('/fonts/')) {
          req.respond({
            status: 200,
            contentType: 'font/woff2',
            body: readFileSync(join(FONTS_DIR, basename(url.pathname))),
          });
        } else if (req.url().startsWith('data:') || url.href === 'about:blank') {
          req.continue();
        } else {
          // No other network is expected — the document is self-contained.
          req.abort();
        }
      });

      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
      await page.close();

      const { text, pages } = await extractText(pdf);
      const missing = NEEDLES[language].filter((needle) => !text.includes(needle));
      const ok = missing.length === 0;
      if (!ok) failures += 1;
      console.log(
        `${ok ? 'OK  ' : 'FAIL'} ${preset.id.padEnd(10)} ${language}  ${pages}p ${(pdf.length / 1024).toFixed(0)}KB` +
          (ok ? '' : `  missing: ${missing.join(' | ')}`),
      );
    }
  }
} finally {
  await browser.close();
}

console.log(
  `\n${combos} render combos in ${((performance.now() - t0) / 1000).toFixed(1)}s — ` +
    (failures === 0
      ? 'all languages survived the PDF round trip.'
      : `${failures} FAILED — inspect before trusting.`),
);
process.exit(failures === 0 ? 0 : 1);
