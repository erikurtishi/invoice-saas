import { z } from 'zod';

import { PROFILE_LANGUAGES } from './profile.js';
import {
  DOCUMENT_TYPES,
  type DocumentType,
  type InvoiceRenderData,
  renderTaxLineSchema,
} from './render/invoice-data.js';
import { templateConfigSchema } from './render/template-config.js';
import { templateNameSchema } from './template.js';
import { optionalText } from './text.js';

/**
 * Invoice payload shapes (backlog Epic 4.1). Imported by `apps/api` for request
 * validation and by `apps/web` for the invoice form resolver (4.2), the library
 * list (4.5) and the live "next number" preview.
 *
 * An Invoice is a tenant-owned entity (decision D3 — owner column `tenantId` →
 * `users.id`, scope injected centrally) and is soft-deleted (decision D4).
 *
 * One model, one `documentType` — Invoice / Proforma / Quote / Credit note /
 * Receipt (spec §5). `DOCUMENT_TYPES` / `DocumentType` come from the renderer's
 * `render/invoice-data.ts` (defined there first so the engine could be built
 * before this model); this file re-uses them so the two never drift.
 *
 * Money crosses the wire as **integers** — every `*Minor` in minor units, every
 * `*Bp` in basis points, `quantityMilli` in milli-units (1000 = "1") — never a
 * decimal string. The web form converts on load/submit with `./money.ts`; the API
 * and DB only ever see integers (decision D17). Totals are authoritative
 * server-side (4.2.3): the server recomputes them with `computeInvoiceTotals`
 * (`./render/invoice-math.ts`) on every save and the form's numbers are display
 * only.
 */

/** `DOCUMENT_TYPES` / `DocumentType` are re-exported by the package barrel from
 * `./render/invoice-data.ts` — imported here, not re-exported, to avoid a
 * duplicate `export *` binding. */

/** Draft-vs-saved, mirrors the Prisma `InvoiceStatus` enum. NOT payment status —
 * paid/unpaid/overdue are explicitly out of scope (spec §6). */
export const INVOICE_STATUSES = ['DRAFT', 'ISSUED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// --- Sanity ceilings (not business rules) -----------------------------------

/** ~10M major units per line — matches `PRODUCT_PRICE_MINOR_MAX`. */
export const INVOICE_UNIT_PRICE_MINOR_MAX = 1_000_000_000;
/** 100_000 bp = 1000%; generous headroom over any real tax rate. */
export const INVOICE_TAX_RATE_BP_MAX = 100_000;
/** A per-line discount is a fraction of that line — never more than 100%. */
export const INVOICE_DISCOUNT_BP_MAX = 10_000;
/** 1000 = one unit. Ceiling ≈ one million units. */
export const INVOICE_QUANTITY_MILLI_MAX = 1_000_000_000;
export const INVOICE_LINE_ITEMS_MAX = 200;

// --- Per-document-type field applicability (backlog 4.1.4) ------------------

/**
 * What each `documentType` changes about the header/totals (spec §5). Drives the
 * form's field visibility (4.2.1), the shared validator below, and — together
 * with `render/labels.ts` — the printed document. Every type has its **own**
 * numbering sequence (decision D20), so there is no "consumes invoice numbers"
 * flag here: a proforma simply draws from the proforma sequence.
 */
export interface DocumentTypeFieldConfig {
  /** The header's second date field. */
  secondaryDate: 'dueDate' | 'validUntil' | 'none';
  showPaidDate: boolean;
  showPaymentMethod: boolean;
  /** The credit-note "for invoice …" reference (4.1.5). */
  showCreditNoteRef: boolean;
  /** The totals-block closing line. */
  amountLine: 'amountDue' | 'amountCredited' | 'none';
}

export const DOCUMENT_TYPE_FIELDS: Record<DocumentType, DocumentTypeFieldConfig> = {
  INVOICE: {
    secondaryDate: 'dueDate',
    showPaidDate: false,
    showPaymentMethod: false,
    showCreditNoteRef: false,
    amountLine: 'amountDue',
  },
  PROFORMA: {
    secondaryDate: 'dueDate',
    showPaidDate: false,
    showPaymentMethod: false,
    showCreditNoteRef: false,
    amountLine: 'amountDue',
  },
  QUOTE: {
    secondaryDate: 'validUntil',
    showPaidDate: false,
    showPaymentMethod: false,
    showCreditNoteRef: false,
    amountLine: 'none',
  },
  CREDIT_NOTE: {
    secondaryDate: 'none',
    showPaidDate: false,
    showPaymentMethod: false,
    showCreditNoteRef: true,
    amountLine: 'amountCredited',
  },
  RECEIPT: {
    secondaryDate: 'none',
    showPaidDate: true,
    showPaymentMethod: true,
    showCreditNoteRef: false,
    amountLine: 'none',
  },
};

// --- Numbering (backlog 4.1.3) ---------------------------------------------

/**
 * Tokens allowed in a numbering `format` string. `{seq}` is required (it is the
 * only part guaranteed unique) and is left-padded to `seqPadding` digits; the
 * year tokens reflect the document's issue year.
 */
export const NUMBER_FORMAT_TOKENS = ['{prefix}', '{YYYY}', '{YY}', '{seq}'] as const;

export const NUMBER_SEQ_PADDING_MIN = 1;
export const NUMBER_SEQ_PADDING_MAX = 10;

/** Lazy-seed default when a tenant first issues a document of the given type. */
export const DEFAULT_NUMBER_FORMATS: Record<DocumentType, string> = {
  INVOICE: 'INV-{YYYY}-{seq}',
  PROFORMA: 'PRO-{YYYY}-{seq}',
  QUOTE: 'QUO-{YYYY}-{seq}',
  CREDIT_NOTE: 'CN-{YYYY}-{seq}',
  RECEIPT: 'REC-{YYYY}-{seq}',
};

/**
 * Renders a raw sequence integer into the display number. Pure — the API calls it
 * after an atomic allocation, the web app calls it to preview the next number.
 * `{prefix}` is a legacy alias kept for hand-written formats; it resolves to the
 * empty string (prefixes are written inline, e.g. `INV-{YYYY}-{seq}`).
 */
export function formatInvoiceNumber(
  format: string,
  input: { seq: number; year: number; seqPadding: number },
): string {
  const seq = String(Math.trunc(input.seq)).padStart(input.seqPadding, '0');
  return format
    .replace(/\{prefix\}/g, '')
    .replace(/\{YYYY\}/g, String(input.year))
    .replace(/\{YY\}/g, String(input.year).slice(-2))
    .replace(/\{seq\}/g, seq);
}

export const invoiceNumberingSettingInputSchema = z.object({
  format: z
    .string()
    .trim()
    .min(1, 'Enter a numbering format.')
    .max(64, 'Format is too long.')
    .refine((value) => value.includes('{seq}'), 'The format must contain {seq}.'),
  seqPadding: z
    .number()
    .int()
    .min(NUMBER_SEQ_PADDING_MIN, 'Padding is too small.')
    .max(NUMBER_SEQ_PADDING_MAX, 'Padding is too large.')
    .default(4),
  /** The tenant's choice (4.1.3): restart the counter each January, or run it
   * continuously. Changing it does not renumber anything already issued. */
  resetYearly: z.boolean().default(true),
});
export type InvoiceNumberingSettingInput = z.infer<typeof invoiceNumberingSettingInputSchema>;

export const invoiceNumberingSettingResponseSchema = invoiceNumberingSettingInputSchema.extend({
  documentType: z.enum(DOCUMENT_TYPES),
  /** Preview of what the next document of this type would be numbered. */
  nextNumberPreview: z.string(),
  updatedAt: z.string(),
});
export type InvoiceNumberingSettingResponse = z.infer<typeof invoiceNumberingSettingResponseSchema>;

// --- Line item ------------------------------------------------------------

export const invoiceLineItemInputSchema = z.object({
  /** Set when the row came from the Product picker; free-text rows omit it. */
  productId: z.string().min(1).nullable().default(null),
  description: z
    .string()
    .trim()
    .min(1, 'Enter a description.')
    .max(500, 'Description is too long.'),
  /** Milli-units: 1000 = "1", 2500 = "2.5". */
  quantityMilli: z
    .number()
    .int('Quantity must be a whole number of milli-units.')
    .min(1, 'Quantity must be greater than zero.')
    .max(INVOICE_QUANTITY_MILLI_MAX, 'That quantity is too large.'),
  unit: optionalText(24),
  unitPriceMinor: z
    .number()
    .int('Unit price must be a whole number of minor units.')
    .min(0, 'Unit price cannot be negative.')
    .max(INVOICE_UNIT_PRICE_MINOR_MAX, 'That unit price is too large.'),
  taxRateBp: z
    .number()
    .int('Tax rate must be a whole number of basis points.')
    .min(0, 'Tax rate cannot be negative.')
    .max(INVOICE_TAX_RATE_BP_MAX, 'That tax rate is too high.')
    .default(0),
  discountBp: z
    .number()
    .int('Discount must be a whole number of basis points.')
    .min(0, 'Discount cannot be negative.')
    .max(INVOICE_DISCOUNT_BP_MAX, 'A line discount cannot exceed 100%.')
    .default(0),
});
export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemInputSchema>;

export const invoiceLineItemResponseSchema = invoiceLineItemInputSchema.extend({
  id: z.string(),
  position: z.number().int(),
  unit: z.string().nullable(),
  lineSubtotalMinor: z.number().int(),
  lineDiscountMinor: z.number().int(),
  lineTaxMinor: z.number().int(),
  lineTotalMinor: z.number().int(),
});
export type InvoiceLineItemResponse = z.infer<typeof invoiceLineItemResponseSchema>;

// --- Invoice header + full input ----------------------------------------

/** ISO 4217, upper-case. Per-invoice currency is deliberately wider than the
 * profile's curated list (4.2.7) — any real currency code is accepted. */
const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code.');

/** `YYYY-MM-DD`. The document's own date, not a timestamp. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');

export const invoiceInputSchema = z
  .object({
    documentType: z.enum(DOCUMENT_TYPES).default('INVOICE'),
    /** Printed-label language (spec §10); defaults from the tenant on the form. */
    language: z.enum(PROFILE_LANGUAGES).default('EN'),
    currency: currencyCode.default('EUR'),
    paperSize: z.enum(['A4', 'LETTER', 'LEGAL', 'A5']).default('A4'),

    /** Nullable so a draft autosave (4.2.6) and the "start from scratch" flow
     * (4.2.4, template saved in the same request) are representable. */
    clientId: z.string().min(1).nullable().default(null),
    templateId: z.string().min(1).nullable().default(null),
    /** "Start from scratch" (4.2.4): a template designed inline. On finalize the
     * API persists it as a reusable `Template` and links the invoice to it. Send
     * `templateId` OR `newTemplate`, never both. */
    newTemplate: z
      .object({ name: templateNameSchema, config: templateConfigSchema })
      .nullable()
      .default(null),

    issueDate: isoDate,
    /** Payment due (Invoice/Proforma) or "valid until" (Quote); null otherwise. */
    dueDate: isoDate.nullable().default(null),
    /** Receipt only. */
    paidDate: isoDate.nullable().default(null),
    paymentMethod: optionalText(120),

    /** Credit note only (4.1.5): free-text original number, and/or a hard link to
     * one of this tenant's invoices. */
    creditNoteRef: optionalText(64),
    creditNoteOfId: z.string().min(1).nullable().default(null),

    reference: optionalText(120),
    notes: optionalText(4000),
    footerText: optionalText(500),
    signatureLabel: optionalText(120),

    lineItems: z
      .array(invoiceLineItemInputSchema)
      .max(INVOICE_LINE_ITEMS_MAX, 'Too many line items.')
      .default([]),
  })
  .superRefine((value, ctx) => {
    const fields = DOCUMENT_TYPE_FIELDS[value.documentType];
    if (fields.showCreditNoteRef && !value.creditNoteRef && !value.creditNoteOfId) {
      ctx.addIssue({
        code: 'custom',
        path: ['creditNoteRef'],
        message: 'A credit note must reference the original invoice.',
      });
    }
    if (value.templateId && value.newTemplate) {
      ctx.addIssue({
        code: 'custom',
        path: ['templateId'],
        message: 'Pick a saved template or design a new one — not both.',
      });
    }
  });
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

/**
 * Body for `POST /invoices/:id/pdf` and `/send` (backlog 4.4.2). `draft: null` →
 * render the saved invoice (the read-only detail screen). `draft` present → render
 * the caller's *unsaved* edits as this invoice, keeping its number — the "preview
 * a what-if without committing" the spec calls for. Nothing is persisted either way.
 */
export const invoiceRenderRequestSchema = z.object({
  draft: invoiceInputSchema.nullable().default(null),
});
export type InvoiceRenderRequest = z.infer<typeof invoiceRenderRequestSchema>;

/**
 * `POST /invoices/calculate` (backlog 4.2.3) — the server is the source of truth
 * for totals; the form uses `computeInvoiceTotals` locally only for instant
 * display. Just the fields that affect the maths.
 */
export const invoiceCalculateSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES).default('INVOICE'),
  lineItems: z
    .array(invoiceLineItemInputSchema)
    .max(INVOICE_LINE_ITEMS_MAX, 'Too many line items.')
    .default([]),
});
export type InvoiceCalculateInput = z.infer<typeof invoiceCalculateSchema>;

export const invoiceTotalsResponseSchema = z.object({
  subtotalMinor: z.number().int(),
  discountTotalMinor: z.number().int(),
  taxTotalMinor: z.number().int(),
  grandTotalMinor: z.number().int(),
  amountDueMinor: z.number().int(),
  /** Per-rate breakdown, recomputed from the line items (not stored column-wise). */
  taxLines: z.array(renderTaxLineSchema),
});
export type InvoiceTotalsResponse = z.infer<typeof invoiceTotalsResponseSchema>;

export const invoiceResponseSchema = z.object({
  id: z.string(),
  status: z.enum(INVOICE_STATUSES),
  documentType: z.enum(DOCUMENT_TYPES),

  /** Null while `status === 'DRAFT'`. */
  number: z.string().nullable(),
  numberSeq: z.number().int().nullable(),
  numberYear: z.number().int().nullable(),

  language: z.enum(PROFILE_LANGUAGES),
  currency: z.string(),
  paperSize: z.enum(['A4', 'LETTER', 'LEGAL', 'A5']),

  clientId: z.string().nullable(),
  templateId: z.string().nullable(),
  /** The template's design, resolved server-side — includes a soft-deleted
   * template so a historical invoice keeps rendering (X.7.22). Falls back to the
   * default design when `templateMissing`. */
  templateConfig: templateConfigSchema,
  /** True when `templateId` was set but the row is gone entirely — the UI shows a
   * "template no longer available" notice (X.7.22). */
  templateMissing: z.boolean(),

  business: z.object({
    name: z.string().nullable(),
    address: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    taxId: z.string().nullable(),
    logoUrl: z.string().nullable(),
  }),
  client: z.object({
    name: z.string().nullable(),
    address: z.string().nullable(),
    email: z.string().nullable(),
    taxId: z.string().nullable(),
  }),

  issueDate: isoDate,
  dueDate: isoDate.nullable(),
  paidDate: isoDate.nullable(),
  paymentMethod: z.string().nullable(),

  creditNoteRef: z.string().nullable(),
  creditNoteOfId: z.string().nullable(),

  reference: z.string().nullable(),
  notes: z.string().nullable(),
  footerText: z.string().nullable(),
  signatureLabel: z.string().nullable(),

  lineItems: z.array(invoiceLineItemResponseSchema),
  totals: invoiceTotalsResponseSchema,

  issuedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;

function splitAddress(value: string | null): string[] {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Map a saved invoice into the renderer's input shape (backlog 4.3.1 / 4.2.5). The
 * one place `InvoiceResponse → InvoiceRenderData` lives, so the server PDF and the
 * web preview of a saved invoice can't disagree. `DOCUMENT_TYPE_FIELDS` decides
 * which header fields the type actually shows (spec §5); the persisted line/total
 * amounts are already integer minor units (D17) and pass straight through.
 */
export function invoiceResponseToRenderData(invoice: InvoiceResponse): InvoiceRenderData {
  const fields = DOCUMENT_TYPE_FIELDS[invoice.documentType];
  return {
    documentType: invoice.documentType,
    language: invoice.language,
    currency: invoice.currency,
    number: invoice.number ?? 'DRAFT',
    issueDate: invoice.issueDate,
    dueDate: fields.secondaryDate === 'none' ? null : invoice.dueDate,
    paidDate: fields.showPaidDate ? invoice.paidDate : null,
    paymentMethod: fields.showPaymentMethod ? invoice.paymentMethod : null,
    creditNoteRef: fields.showCreditNoteRef ? invoice.creditNoteRef : null,
    reference: invoice.reference,
    business: {
      name: invoice.business.name ?? '',
      addressLines: splitAddress(invoice.business.address),
      email: invoice.business.email,
      phone: invoice.business.phone,
      taxId: invoice.business.taxId,
    },
    businessLogoUrl: invoice.business.logoUrl,
    client: {
      name: invoice.client.name ?? '',
      addressLines: splitAddress(invoice.client.address),
      email: invoice.client.email,
      phone: null,
      taxId: invoice.client.taxId,
    },
    lineItems: invoice.lineItems.map((li) => ({
      description: li.description,
      quantityMilli: li.quantityMilli,
      unit: li.unit,
      unitPriceMinor: li.unitPriceMinor,
      taxRateBp: li.taxRateBp,
      discountBp: li.discountBp,
      lineSubtotalMinor: li.lineSubtotalMinor,
      lineDiscountMinor: li.lineDiscountMinor,
      lineTaxMinor: li.lineTaxMinor,
      lineTotalMinor: li.lineTotalMinor,
    })),
    totals: {
      subtotalMinor: invoice.totals.subtotalMinor,
      discountTotalMinor: invoice.totals.discountTotalMinor,
      taxLines: invoice.totals.taxLines,
      taxTotalMinor: invoice.totals.taxTotalMinor,
      grandTotalMinor: invoice.totals.grandTotalMinor,
      amountDueMinor: invoice.totals.amountDueMinor,
    },
    notes: invoice.notes,
    bankDetails: null,
    footerText: invoice.footerText,
    signatureLabel: invoice.signatureLabel,
  };
}

/** `POST /invoices/:id/send` result (backlog 4.3.4 / X.7.10 — the send
 * confirmation is the user's only proof it went out). */
export const invoiceSendResponseSchema = z.object({
  recipient: z.string(),
  sentAt: z.string(),
  filename: z.string(),
});
export type InvoiceSendResponse = z.infer<typeof invoiceSendResponseSchema>;

/** `INV-2026-0001` + `Acme Trading LLC` → `INV-2026-0001_AcmeTradingLLC.pdf` (4.3.3). */
export function invoicePdfFilename(invoice: Pick<InvoiceResponse, 'number' | 'client'>): string {
  const number = (invoice.number ?? 'invoice').replace(/[^A-Za-z0-9._-]+/g, '-');
  const client = (invoice.client.name ?? '')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 60);
  return `${number}${client ? `_${client}` : ''}.pdf`;
}

// --- Library list + CSV export (backlog Epic 4.5) -----------------------

/** `newest`/`oldest` sort on the document (issue) date; `client` / `total` on the
 * snapshot name / stored grand total. */
export const INVOICE_SORT_VALUES = [
  'newest',
  'oldest',
  'client',
  '-client',
  'total',
  '-total',
] as const;
export type InvoiceSort = (typeof INVOICE_SORT_VALUES)[number];

/** Status filter — the library defaults to `issued` (real documents), per the
 * Epic 4.5 decision. */
export const INVOICE_STATUS_FILTERS = ['all', 'issued', 'draft'] as const;
export type InvoiceStatusFilter = (typeof INVOICE_STATUS_FILTERS)[number];

export const INVOICE_PAGE_SIZE = 25;
export const INVOICE_PAGE_SIZE_MAX = 100;

/**
 * Query string for `GET /invoices` (4.5.1) and `GET /invoices/export.csv` (4.5.4)
 * — the CSV uses every filter but ignores `page` / `pageSize` (it exports the
 * whole filtered set). A bare `GET /invoices` is valid: `status` defaults to
 * `issued`, `sort` to `newest`.
 */
export const invoiceListQuerySchema = z.object({
  /** Matches the document number or the snapshot client name. */
  search: z.string().trim().max(200).optional(),
  status: z.enum(INVOICE_STATUS_FILTERS).default('issued'),
  /** Omitted → every type. */
  documentType: z.enum(DOCUMENT_TYPES).optional(),
  /** Inclusive issue-date range. */
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  sort: z.enum(INVOICE_SORT_VALUES).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(INVOICE_PAGE_SIZE_MAX).default(INVOICE_PAGE_SIZE),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

/** A row of the library list — the scalar columns only (no line items); the
 * `grandTotalMinor` is the stored total, written on every save. */
export const invoiceListItemSchema = z.object({
  id: z.string(),
  status: z.enum(INVOICE_STATUSES),
  documentType: z.enum(DOCUMENT_TYPES),
  number: z.string().nullable(),
  clientName: z.string().nullable(),
  clientEmail: z.string().nullable(),
  currency: z.string(),
  issueDate: isoDate,
  dueDate: isoDate.nullable(),
  grandTotalMinor: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InvoiceListItem = z.infer<typeof invoiceListItemSchema>;

export const invoiceListResponseSchema = z.object({
  items: z.array(invoiceListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;
