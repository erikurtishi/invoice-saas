import { formatDate, formatMoney, formatPercent, formatQuantity } from './format.js';
import { esc, escMultiline, lines } from './html.js';
import type { InvoiceRenderData, RenderParty } from './invoice-data.js';
import type { RenderLabels } from './labels.js';
import type { TemplateBlock, TemplateConfig } from './template-config.js';

/**
 * One renderer per invoice block (backlog 3.1.3). Each returns an HTML string, or
 * `''` when the block is toggled off or has nothing to show — `render.ts` walks
 * `config.blockOrder` and concatenates the non-empty results. Blocks never compute
 * money; every amount on `data` is already an integer minor unit (decision D17).
 */

export interface RenderContext {
  config: TemplateConfig;
  data: InvoiceRenderData;
  labels: RenderLabels;
  /** Resolves a root-relative logo URL for the target origin. */
  assetBaseUrl: string;
}

type BlockRenderer = (ctx: RenderContext) => string;

function money(ctx: RenderContext, minor: number): string {
  return formatMoney(minor, ctx.data.currency, ctx.data.language);
}

function resolveUrl(assetBaseUrl: string, url: string): string {
  if (/^(https?:|data:)/.test(url)) return url;
  return `${assetBaseUrl.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

function partyLines(ctx: RenderContext, party: RenderParty): string {
  const { labels } = ctx;
  return lines(
    `<div class="party-name">${esc(party.name)}</div>`,
    ...party.addressLines.map((line) => `<div class="party-line">${esc(line)}</div>`),
    party.phone ? `<div class="party-line">${esc(party.phone)}</div>` : '',
    party.email ? `<div class="party-line">${esc(party.email)}</div>` : '',
    party.taxId ? `<div class="party-line">${esc(labels.taxId)}: ${esc(party.taxId)}</div>` : '',
  );
}

const header: BlockRenderer = (ctx) => {
  const { config, data, labels } = ctx;
  const logo = data.businessLogoUrl
    ? `<img class="doc-logo" src="${esc(resolveUrl(ctx.assetBaseUrl, data.businessLogoUrl))}" alt="${esc(data.business.name)}">`
    : `<div class="doc-logo-fallback">${esc(data.business.name)}</div>`;

  const subtitleBits = [
    `${esc(labels.invoiceNo)} ${esc(data.number)}`,
    data.documentType === 'CREDIT_NOTE' && data.creditNoteRef
      ? `${esc(labels.creditNoteFor)} ${esc(data.creditNoteRef)}`
      : '',
  ].filter(Boolean);

  return lines(
    `<header class="block doc-header logo-${esc(config.logo.position)}">`,
    `  <div class="doc-brand">${logo}</div>`,
    `  <div class="doc-headings">`,
    `    <div class="doc-title">${esc(labels.documentTitle[data.documentType])}</div>`,
    `    <div class="doc-title-sub">${subtitleBits.join(' · ')}</div>`,
    `  </div>`,
    `</header>`,
  );
};

const businessInfo: BlockRenderer = (ctx) =>
  lines(
    `<section class="block party-block">`,
    `  <div class="block-heading">${esc(ctx.labels.from)}</div>`,
    `  <div class="party">${partyLines(ctx, ctx.data.business)}</div>`,
    `</section>`,
  );

const clientInfo: BlockRenderer = (ctx) =>
  lines(
    `<section class="block party-block">`,
    `  <div class="block-heading">${esc(ctx.labels.billedTo)}</div>`,
    `  <div class="party">${partyLines(ctx, ctx.data.client)}</div>`,
    `</section>`,
  );

const invoiceMeta: BlockRenderer = (ctx) => {
  const { data, labels } = ctx;
  const items: Array<[string, string]> = [
    [labels.issueDate, formatDate(data.issueDate, data.language)],
  ];

  if (data.documentType === 'QUOTE' && data.dueDate) {
    items.push([labels.validUntil, formatDate(data.dueDate, data.language)]);
  } else if (
    (data.documentType === 'INVOICE' || data.documentType === 'PROFORMA') &&
    data.dueDate
  ) {
    items.push([labels.dueDate, formatDate(data.dueDate, data.language)]);
  }
  if (data.documentType === 'RECEIPT') {
    if (data.paidDate) items.push([labels.paidOn, formatDate(data.paidDate, data.language)]);
    if (data.paymentMethod) items.push([labels.paymentMethod, data.paymentMethod]);
  }
  if (data.reference) items.push([labels.reference, data.reference]);

  return lines(
    `<section class="block meta">`,
    ...items.map(
      ([label, value]) =>
        `  <div class="meta-item"><span class="meta-label">${esc(label)}</span>` +
        `<span class="meta-value">${esc(value)}</span></div>`,
    ),
    `</section>`,
  );
};

const lineItems: BlockRenderer = (ctx) => {
  const { data, labels, config } = ctx;
  const v = config.visibility;

  const cols = [
    `<th>${esc(labels.description)}</th>`,
    `<th class="num">${esc(labels.quantity)}</th>`,
    v.unitPrice ? `<th class="num">${esc(labels.unitPrice)}</th>` : '',
    v.discountColumn ? `<th class="num">${esc(labels.discount)}</th>` : '',
    v.taxColumn ? `<th class="num">${esc(labels.taxRate)}</th>` : '',
    `<th class="num">${esc(labels.amount)}</th>`,
  ].filter(Boolean);

  const rows = data.lineItems.map((item) => {
    const qty = formatQuantity(item.quantityMilli, data.language);
    return lines(
      `<tr>`,
      `  <td>${esc(item.description)}` +
        (item.unit ? `<div class="desc-unit">${esc(item.unit)}</div>` : '') +
        `</td>`,
      `  <td class="num">${esc(qty)}</td>`,
      v.unitPrice ? `  <td class="num">${esc(money(ctx, item.unitPriceMinor))}</td>` : '',
      v.discountColumn
        ? `  <td class="num">${item.discountBp ? esc(formatPercent(item.discountBp, data.language)) : '—'}</td>`
        : '',
      v.taxColumn
        ? `  <td class="num">${item.taxRateBp ? esc(formatPercent(item.taxRateBp, data.language)) : '—'}</td>`
        : '',
      `  <td class="num">${esc(money(ctx, item.lineTotalMinor))}</td>`,
      `</tr>`,
    );
  });

  return lines(
    `<section class="block line-items">`,
    `  <table class="items">`,
    `    <thead><tr>${cols.join('')}</tr></thead>`,
    `    <tbody>`,
    ...rows,
    `    </tbody>`,
    `  </table>`,
    `</section>`,
  );
};

const totals: BlockRenderer = (ctx) => {
  const { data, labels } = ctx;
  const t = data.totals;
  const rows: string[] = [row(labels.subtotal, money(ctx, t.subtotalMinor))];

  if (t.discountTotalMinor > 0) {
    rows.push(row(labels.totalDiscount, `−${money(ctx, t.discountTotalMinor)}`));
  }
  for (const tax of t.taxLines) {
    rows.push(
      row(`${labels.tax} ${formatPercent(tax.rateBp, data.language)}`, money(ctx, tax.taxMinor)),
    );
  }

  // The prominent bottom row is labelled by document type (spec §5): an invoice /
  // proforma asks for an "Amount due", a credit note shows "Amount credited",
  // everything else is just the "Total".
  const isInvoiceLike = data.documentType === 'INVOICE' || data.documentType === 'PROFORMA';

  // When the amount due differs from the computed total (a deposit/credit, later),
  // show the plain total first, then the amount due as the grand row.
  if (isInvoiceLike && t.amountDueMinor !== t.grandTotalMinor) {
    rows.push(row(labels.total, money(ctx, t.grandTotalMinor)));
  }

  const grandLabel = isInvoiceLike
    ? labels.amountDue
    : data.documentType === 'CREDIT_NOTE'
      ? labels.amountCredited
      : labels.total;
  const grandAmount = isInvoiceLike ? t.amountDueMinor : t.grandTotalMinor;
  rows.push(row(grandLabel, money(ctx, grandAmount), 'grand'));

  return lines(
    `<section class="block totals">`,
    `  <div class="totals-table">`,
    ...rows,
    `  </div>`,
    `</section>`,
  );

  function row(label: string, value: string, modifier = ''): string {
    return (
      `<div class="totals-row ${modifier}"><span>${esc(label)}</span>` +
      `<span class="num">${esc(value)}</span></div>`
    );
  }
};

const notes: BlockRenderer = (ctx) => {
  if (!ctx.config.visibility.notes || !ctx.data.notes) return '';
  return lines(
    `<section class="block">`,
    `  <div class="block-heading">${esc(ctx.labels.notes)}</div>`,
    `  <div class="prose">${escMultiline(ctx.data.notes)}</div>`,
    `</section>`,
  );
};

const bankDetails: BlockRenderer = (ctx) => {
  const b = ctx.data.bankDetails;
  if (!ctx.config.visibility.bankDetails || !b) return '';
  const { labels } = ctx;
  const rows: Array<[string, string | null]> = [
    [labels.bankName, b.bankName],
    [labels.accountName, b.accountName],
    [labels.iban, b.iban],
    [labels.swift, b.swift],
    [labels.accountNumber, b.accountNumber],
  ];
  const defined = rows.filter(([, value]) => Boolean(value));
  if (defined.length === 0) return '';

  return lines(
    `<section class="block">`,
    `  <div class="block-heading">${esc(labels.bankDetails)}</div>`,
    `  <dl class="bank-grid">`,
    ...defined.map(([label, value]) => `    <dt>${esc(label)}</dt><dd>${esc(value)}</dd>`),
    `  </dl>`,
    `</section>`,
  );
};

const signature: BlockRenderer = (ctx) => {
  if (!ctx.config.visibility.signature) return '';
  const label = ctx.data.signatureLabel ?? ctx.labels.signature;
  return lines(
    `<section class="block signature-block">`,
    `  <div class="signature-line">${esc(label)}</div>`,
    `</section>`,
  );
};

const footer: BlockRenderer = (ctx) => {
  if (!ctx.config.visibility.footer || !ctx.data.footerText) return '';
  return `<footer class="block doc-footer">${escMultiline(ctx.data.footerText)}</footer>`;
};

export const BLOCK_RENDERERS: Record<TemplateBlock, BlockRenderer> = {
  header,
  businessInfo,
  clientInfo,
  invoiceMeta,
  lineItems,
  totals,
  notes,
  bankDetails,
  signature,
  footer,
};
