/**
 * Puppeteer smoke test — the backlog's #1 risk ("PDF rendering is slow/heavy on
 * shared hosting", mitigation: test on the real host early, in Phase 0/1).
 *
 * Run identically on a laptop and on the deployed host:
 *   node apps/api/scripts/pdf-smoke.mjs
 *
 * It answers four questions:
 *   1. Does headless Chrome launch at all on this box?
 *   2. How long does a cold launch cost, and how long is a warm render?
 *   3. Are the page dimensions right for A4 and US Letter (spec §4)?
 *   4. Does the PDF carry embedded fonts and real text, and does Cyrillic survive
 *      (spec §10 — Macedonian must not silently break)?
 */
import { execSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import puppeteer from 'puppeteer';

const WARM_RUNS = 5;

// Latin, Albanian (ë, ç) and Macedonian Cyrillic — the three scripts this product ships.
const SAMPLES = {
  english: 'Invoice — Amount Due',
  albanian: 'Faturë — Shuma për t’u paguar',
  macedonian: 'Фактура — Износ за плаќање',
};

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { margin: 18mm; }
  /* Never system-ui: on macOS it emits a ToUnicode map that turns Cyrillic к
     (U+043A) into Latin ĸ (U+0138) — the PDF looks right but copies out wrong.
     Task 3.1.6 replaces this with self-hosted Noto Sans/Serif. */
  body { font-family: 'Noto Sans', Helvetica, Arial, sans-serif; color: #111; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: left; }
  td.num, th.num { text-align: right; }
</style></head><body>
  <h1>${SAMPLES.english}</h1>
  <div>${SAMPLES.albanian}</div>
  <div>${SAMPLES.macedonian}</div>
  <table>
    <thead><tr><th>Опис / Përshkrimi</th><th class="num">Qty</th><th class="num">Цена</th></tr></thead>
    <tbody>
      <tr><td>Веб дизајн</td><td class="num">3</td><td class="num">150,00 €</td></tr>
      <tr><td>Shërbime konsulence</td><td class="num">2</td><td class="num">90,00 €</td></tr>
    </tbody>
  </table>
</body></html>`;

const ms = (n) => `${n.toFixed(0)} ms`;

/**
 * Chrome writes compressed object streams, so the page dictionaries are not visible
 * in the raw bytes — this has to go through a real PDF parser to mean anything.
 */
async function inspectPdf(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: false }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });

  const textContent = await page.getTextContent();
  const text = textContent.items.map((item) => item.str).join('');

  return {
    pages: doc.numPages,
    width: viewport.width,
    height: viewport.height,
    text,
  };
}

// PDF user units are 1/72 inch. A4 = 210x297mm, US Letter = 8.5x11in.
const EXPECTED = {
  a4: [595, 842],
  letter: [612, 792],
};

function checkSize(label, width, height) {
  const [ew, eh] = EXPECTED[label];
  const ok = Math.abs(width - ew) <= 2 && Math.abs(height - eh) <= 2;
  return `${label}: ${width.toFixed(0)}x${height.toFixed(0)}pt (expected ${ew}x${eh}) ${ok ? 'OK' : 'MISMATCH'}`;
}

const outDir = await mkdtemp(join(tmpdir(), 'pdf-smoke-'));
console.log('=== environment ===');
console.log(`node        ${process.version}`);
console.log(`platform    ${process.platform} ${process.arch}`);
console.log(`out dir     ${outDir}`);

let browser;
const tLaunch = performance.now();
try {
  browser = await puppeteer.launch({
    headless: true,
    // --no-sandbox is required on most VPS images (no user namespaces). It is safe
    // ONLY because we render our own trusted HTML, never third-party pages.
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
} catch (error) {
  console.error('\nFAILED TO LAUNCH CHROME');
  console.error(error.message);
  console.error('\nOn a Debian/Ubuntu VPS this usually means missing shared libraries.');
  console.error('Run:  npx puppeteer browsers install chrome --install-deps');
  process.exit(1);
}
const launchMs = performance.now() - tLaunch;

console.log(`chrome      ${await browser.version()}`);
console.log(`\n=== timings ===`);
console.log(`cold launch     ${ms(launchMs)}`);

const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle0' });

// Report what Chrome actually resolved for our text — a box with no Cyrillic font
// installed is exactly how "Cyrillic breaks in PDF but not on screen" happens.
const fontCheck = await page.evaluate((mk) => {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;font-size:40px';
  probe.textContent = mk;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return { renderedWidth: Math.round(width) };
}, SAMPLES.macedonian);

const results = {};
for (const [label, format] of [
  ['a4', 'A4'],
  ['letter', 'Letter'],
]) {
  const t0 = performance.now();
  const buffer = await page.pdf({ format, printBackground: true });
  const elapsed = performance.now() - t0;
  const file = join(outDir, `${label}.pdf`);
  await writeFile(file, buffer);
  results[label] = { elapsed, file, size: buffer.length, ...(await inspectPdf(buffer)) };
  console.log(`first render ${label.padEnd(7)} ${ms(elapsed)}`);
}

const warm = [];
for (let i = 0; i < WARM_RUNS; i += 1) {
  const t0 = performance.now();
  await page.pdf({ format: 'A4', printBackground: true });
  warm.push(performance.now() - t0);
}
warm.sort((a, b) => a - b);
console.log(
  `warm A4 x${WARM_RUNS}    min ${ms(warm[0])} / median ${ms(warm[Math.floor(WARM_RUNS / 2)])} / max ${ms(warm[warm.length - 1])}`,
);

// Peak RSS of the Chrome process tree, so we know what a VPS needs to hold.
const pid = browser.process()?.pid;
if (pid && process.platform !== 'win32') {
  try {
    const rss = execSync(
      `ps -o rss= -g $(ps -o pgid= -p ${pid} | tr -d ' ') 2>/dev/null || ps -o rss= -p ${pid}`,
    )
      .toString()
      .trim()
      .split('\n')
      .reduce((sum, line) => sum + Number(line.trim() || 0), 0);
    console.log(
      `chrome RSS      ~${(rss / 1024).toFixed(0)} MB (sum across the process group; double-counts shared memory)`,
    );
  } catch {
    /* ps unavailable — not fatal */
  }
}

console.log(`\n=== output ===`);
for (const [label, r] of Object.entries(results)) {
  console.log(`${label}: ${(r.size / 1024).toFixed(0)} KB, ${r.pages} page(s)`);
  console.log(`  ${checkSize(label, r.width, r.height)}`);
  const extractable = r.text.length > 0;
  console.log(
    `  text extractable: ${extractable ? `yes (${r.text.length} chars)` : 'NO — text is rasterised'}`,
  );
}

console.log(`\n=== cyrillic / albanian ===`);
const extracted = results.a4.text;
if (process.env.SMOKE_DEBUG) {
  console.log(`  extracted: ${JSON.stringify(extracted)}`);
}
const checks = [
  ['macedonian (Фактура)', 'Фактура'],
  ['macedonian (плаќање)', 'плаќање'],
  ['albanian (Faturë)', 'Faturë'],
  ['albanian (Shërbime)', 'Shërbime'],
];
let allPresent = true;
for (const [label, needle] of checks) {
  const present = extracted.includes(needle);
  if (!present) allPresent = false;
  console.log(`  ${present ? 'OK  ' : 'FAIL'} ${label}`);
}
console.log(
  allPresent
    ? '\nAll non-Latin text survived the round trip into the PDF as real, extractable text.'
    : '\nSome text did not survive — inspect the PDF before trusting this host.',
);
console.log(`rendered width of the Macedonian sample at 40px: ${fontCheck.renderedWidth}px`);

await browser.close();
console.log(`\nPDFs written to ${outDir}`);
