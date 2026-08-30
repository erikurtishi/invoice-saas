import { BLOCK_RENDERERS, type RenderContext } from './blocks.js';
import { type InvoiceRenderData, invoiceRenderDataSchema } from './invoice-data.js';
import { renderLabels } from './labels.js';
import { buildStylesheet, type RenderMedia } from './styles.js';
import { type TemplateConfig, templateConfigSchema } from './template-config.js';

/**
 * The single render engine (backlog 3.1.2). `(templateConfig, invoiceData) → HTML`
 * — one function, used by BOTH the live preview (rendered into an iframe) and the
 * server-side PDF (fed to Puppeteer's `page.setContent`). There is no second
 * renderer (CLAUDE.md). It builds a self-contained HTML document: inline
 * `<style>`, `@font-face` pointing at the self-hosted Noto woff2, no scripts.
 *
 * Inputs are parsed through their Zod schemas here, so a malformed config or data
 * object fails loudly at the boundary rather than rendering something broken.
 */

export interface RenderOptions {
  /**
   * `'screen'` (default) draws a page-shaped box with a shadow on a grey backdrop
   * for the preview; `'print'` emits `@page` rules and lets the browser paginate
   * for the PDF.
   */
  media?: RenderMedia;
  /**
   * Origin that serves `/fonts/*` and (if the logo URL is root-relative) the
   * uploaded logo — the API origin in every current caller. Default `''`
   * (root-relative URLs).
   */
  assetBaseUrl?: string;
}

export interface RenderResult {
  /** Complete `<!doctype html>` document. */
  html: string;
  /** The parsed/normalised inputs, handy for callers that also need them. */
  config: TemplateConfig;
  data: InvoiceRenderData;
}

export function renderInvoice(
  configInput: unknown,
  dataInput: unknown,
  options: RenderOptions = {},
): RenderResult {
  const config = templateConfigSchema.parse(configInput);
  const data = invoiceRenderDataSchema.parse(dataInput);
  const media: RenderMedia = options.media ?? 'screen';
  const assetBaseUrl = options.assetBaseUrl ?? '';

  const ctx: RenderContext = {
    config,
    data,
    labels: renderLabels(data.language),
    assetBaseUrl,
  };

  const body = config.blockOrder
    .map((block) => BLOCK_RENDERERS[block](ctx))
    .filter((part) => part.trim() !== '')
    .join('\n');

  const stylesheet = buildStylesheet(config, { media, assetBaseUrl });
  const langAttr = data.language.toLowerCase();
  const title = `${ctx.labels.documentTitle[data.documentType]} ${data.number}`;

  const html = [
    '<!doctype html>',
    `<html lang="${langAttr}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeTitle(title)}</title>`,
    `<style>${stylesheet}</style>`,
    '</head>',
    '<body>',
    '<div class="page">',
    body,
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');

  return { html, config, data };
}

/** Convenience wrapper when the caller only wants the string. */
export function renderInvoiceHtml(config: unknown, data: unknown, options?: RenderOptions): string {
  return renderInvoice(config, data, options).html;
}

function escapeTitle(value: string): string {
  return value.replace(/[<>&]/g, (char) =>
    char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&amp;',
  );
}
