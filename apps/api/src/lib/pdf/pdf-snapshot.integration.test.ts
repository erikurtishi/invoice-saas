import {
  PAPER_GEOMETRY,
  PAPER_SIZES,
  type PaperSize,
  renderInvoice,
  sampleInvoiceData,
  TEMPLATE_PRESETS,
} from '@invoice-saas/shared';
import { afterAll, describe, expect, it } from 'vitest';

import { closeBrowserPool, renderHtmlToPdf } from './browser-pool.js';

/**
 * PDF snapshot tests across every paper size and language (backlog X.5.4).
 *
 * "Snapshot" here is structural, not pixel: pixel diffs are hopelessly flaky
 * across Chrome versions and OSes. Instead, for each `paperSize × language` this
 * renders a real PDF through the same Puppeteer path the download endpoint uses
 * and asserts the two things that actually break — the page comes out at the
 * right physical dimensions, and the localized text survives as real selectable
 * text (the ToUnicode corruption decision D10 guards against, which visual review
 * can't catch).
 *
 * Slow (one headless render per combo) and needs Chrome — same requirement as
 * `npm run render:check` / `pdf:smoke`.
 */

const MM_TO_PT = 72 / 25.4;
const TOLERANCE_PT = 3;

const NEEDLES: Record<'EN' | 'SQ' | 'MK', string[]> = {
  EN: ['Invoice', 'Amount due'],
  SQ: ['Faturë', 'Shuma për pagesë'],
  MK: ['Фактура', 'Износ за плаќање'],
};

const preset = TEMPLATE_PRESETS[0]!;

async function readPdf(
  buffer: Buffer,
): Promise<{ pages: number; widthPt: number; heightPt: number; text: string }> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: false }).promise;
  const viewport = (await doc.getPage(1)).getViewport({ scale: 1 });
  let text = '';
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items.map((item) => ('str' in item ? item.str : '')).join('');
  }
  return { pages: doc.numPages, widthPt: viewport.width, heightPt: viewport.height, text };
}

afterAll(async () => {
  await closeBrowserPool();
});

describe('invoice PDF across paper sizes and languages', () => {
  const combos: { size: PaperSize; language: 'EN' | 'SQ' | 'MK' }[] = [];
  for (const size of PAPER_SIZES) {
    for (const language of ['EN', 'SQ', 'MK'] as const) combos.push({ size, language });
  }

  it.each(combos)('$size / $language renders to spec', async ({ size, language }) => {
    const config = { ...preset.config, paperSize: size };
    const data = sampleInvoiceData({ language });
    const { html } = renderInvoice(config, data, {
      media: 'print',
      assetBaseUrl: 'http://pdf.test',
    });

    const pdf = await renderHtmlToPdf(html);
    const { pages, widthPt, heightPt, text } = await readPdf(pdf);

    const geo = PAPER_GEOMETRY[size];
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(widthPt).toBeCloseTo(geo.widthMm * MM_TO_PT, -1); // ~within a point
    expect(Math.abs(widthPt - geo.widthMm * MM_TO_PT)).toBeLessThan(TOLERANCE_PT);
    expect(Math.abs(heightPt - geo.heightMm * MM_TO_PT)).toBeLessThan(TOLERANCE_PT);

    for (const needle of NEEDLES[language]) {
      expect(text, `${size}/${language} PDF should contain "${needle}"`).toContain(needle);
    }
  });
});
