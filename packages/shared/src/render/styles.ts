import { fontFaceCss, fontStackFor } from './fonts.js';
import { paperGeometry } from './paper.js';
import { LOGO_SIZE_PX, type TemplateConfig } from './template-config.js';

export type RenderMedia = 'screen' | 'print';

export interface StyleOptions {
  media: RenderMedia;
  assetBaseUrl: string;
}

/**
 * The invoice stylesheet (backlog 3.1.4 paper sizes, 3.1.5 multi-page). One
 * builder for both targets:
 *
 * - `screen` — a `.page` box at the true mm dimensions with a drop shadow, on a
 *   grey backdrop. This is the live preview (3.2.2) — "true page proportions".
 * - `print` — `@page { size; margin }` drives the PDF; `.page` loses its frame and
 *   the browser paginates. `thead { display: table-header-group }` repeats the
 *   line-item header on every page; `break-inside: avoid` keeps rows, the totals
 *   block and the signature from splitting across a page boundary.
 *
 * The exact same DOM is used for both — only this stylesheet differs.
 */
export function buildStylesheet(config: TemplateConfig, options: StyleOptions): string {
  const geo = paperGeometry(config.paperSize);
  const stack = fontStackFor(config.fontPairing);
  const logoPx = LOGO_SIZE_PX[config.logo.size];
  const isPrint = options.media === 'print';

  return [
    fontFaceCss(options.assetBaseUrl),
    `:root{
      --accent:${config.accentColor};
      --font-body:${stack.body};
      --font-heading:${stack.heading};
      --ink:#1a1a1a;
      --muted:#666;
      --hairline:#e2e2e2;
      --logo-h:${logoPx}px;
    }`,
    `*{box-sizing:border-box;margin:0;padding:0}`,
    `html,body{background:${isPrint ? '#fff' : '#f1f1f4'};font-family:var(--font-body);
      color:var(--ink);font-size:12px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}`,

    // --- Page box ---------------------------------------------------------------
    isPrint
      ? `@page{size:${geo.cssSize};margin:${geo.marginMm}mm}
         .page{width:auto;min-height:0;padding:0;margin:0;background:#fff;box-shadow:none}`
      : `.page{width:${geo.widthMm}mm;min-height:${geo.heightMm}mm;padding:${geo.marginMm}mm;
         margin:16px auto;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12),0 8px 24px rgba(0,0,0,.08)}`,
    `.page{display:flex;flex-direction:column;gap:22px}`,

    // --- Blocks --------------------------------------------------------------
    `.block{break-inside:avoid}`,
    `.block-heading{font-family:var(--font-heading);font-size:10px;font-weight:700;
      letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}`,

    // Header
    `.doc-header{display:flex;gap:20px;align-items:flex-start;justify-content:space-between}`,
    `.doc-header.logo-center{flex-direction:column;align-items:center;text-align:center}`,
    `.doc-header.logo-right{flex-direction:row-reverse}`,
    `.doc-logo{height:var(--logo-h);width:auto;max-width:240px;object-fit:contain}`,
    `.doc-logo-fallback{font-family:var(--font-heading);font-size:18px;font-weight:700;color:var(--accent)}`,
    `.doc-title{font-family:var(--font-heading);font-size:26px;font-weight:700;color:var(--accent);line-height:1.1}`,
    `.doc-title-sub{font-size:11px;color:var(--muted);margin-top:2px}`,

    // Parties
    `.parties{display:flex;gap:32px;flex-wrap:wrap}`,
    `.party{flex:1;min-width:180px}`,
    `.party-name{font-weight:700;font-size:13px}`,
    `.party-line{color:var(--muted)}`,

    // Meta
    `.meta{display:flex;flex-wrap:wrap;gap:6px 28px}`,
    `.meta-item{display:flex;gap:8px;font-size:11px}`,
    `.meta-label{color:var(--muted)}`,
    `.meta-value{font-weight:600}`,

    // Line items
    `table.items{width:100%;border-collapse:collapse;font-size:11px}`,
    `table.items thead{display:table-header-group}`,
    `table.items th{background:var(--accent);color:#fff;text-align:left;padding:7px 8px;font-weight:600;
      font-size:10px;letter-spacing:.03em;text-transform:uppercase}`,
    `table.items td{padding:7px 8px;border-bottom:1px solid var(--hairline);vertical-align:top}`,
    `table.items tr{break-inside:avoid}`,
    `table.items .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}`,
    `table.items .desc-unit{color:var(--muted);font-size:10px}`,

    // Totals
    `.totals{display:flex;justify-content:flex-end;break-inside:avoid}`,
    `.totals-table{min-width:240px;font-size:11px}`,
    `.totals-row{display:flex;justify-content:space-between;gap:24px;padding:4px 0}`,
    `.totals-row.grand{border-top:2px solid var(--accent);margin-top:4px;padding-top:8px;
      font-size:14px;font-weight:700;color:var(--accent)}`,
    `.totals-row .num{font-variant-numeric:tabular-nums}`,

    // Notes / bank / footer / signature
    `.prose{white-space:pre-wrap;color:var(--ink)}`,
    `.bank-grid{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;font-size:11px}`,
    `.bank-grid dt{color:var(--muted)}`,
    `.bank-grid dd{font-weight:600}`,
    `.signature-block{break-inside:avoid;margin-top:12px}`,
    `.signature-line{margin-top:36px;border-top:1px solid var(--ink);width:220px;padding-top:4px;
      font-size:10px;color:var(--muted)}`,
    `.doc-footer{border-top:1px solid var(--hairline);padding-top:10px;font-size:10px;color:var(--muted);
      text-align:center}`,
    `.spacer{flex:1}`,
  ].join('\n');
}
