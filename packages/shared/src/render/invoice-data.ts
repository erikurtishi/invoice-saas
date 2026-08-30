import { z } from 'zod';

import { PROFILE_LANGUAGES } from '../profile.js';

/**
 * The renderer's input data (backlog 3.1.2). This is the *resolved, ready-to-draw*
 * view of an invoice — business and client already flattened to plain fields, line
 * amounts and document totals already computed. The renderer never touches the
 * database and never does money maths beyond formatting (spec §8: "your code
 * always does that" — see `invoice-math.ts` / backlog 4.1.2 for the calculator).
 *
 * Phase 4's Invoice model (4.1.1) will produce a value of this shape; defining it
 * here lets 3.1 build and test the renderer before that model exists.
 *
 * All money is integer minor units (decision D17). Quantities are integer
 * milli-units (`quantityMilli`: 1000 = "1", 2500 = "2.5") so fractional hours /
 * units stay exact without a float.
 */

/** spec §5 — one engine, one type field that swaps a few labels/fields. */
export const DOCUMENT_TYPES = ['INVOICE', 'PROFORMA', 'QUOTE', 'CREDIT_NOTE', 'RECEIPT'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** A resolved party (business or client) as printed on the document. */
export const renderPartySchema = z.object({
  name: z.string(),
  addressLines: z.array(z.string()).default([]),
  email: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  taxId: z.string().nullable().default(null),
});
export type RenderParty = z.infer<typeof renderPartySchema>;

export const renderLineItemSchema = z.object({
  description: z.string(),
  /** 1000 = one unit. */
  quantityMilli: z.number().int(),
  unit: z.string().nullable().default(null),
  unitPriceMinor: z.number().int(),
  /** Basis points, 1800 = 18%. */
  taxRateBp: z.number().int().default(0),
  /** Per-line discount in basis points of the line subtotal (0 = none). */
  discountBp: z.number().int().default(0),
  /** qty × unitPrice, pre-discount, pre-tax. */
  lineSubtotalMinor: z.number().int(),
  /** Discount amount applied to this line. */
  lineDiscountMinor: z.number().int().default(0),
  /** Tax amount for this line (after discount). */
  lineTaxMinor: z.number().int().default(0),
  /** What this line contributes to the grand total (subtotal − discount + tax). */
  lineTotalMinor: z.number().int(),
});
export type RenderLineItem = z.infer<typeof renderLineItemSchema>;

/** One row of the tax summary — amounts grouped by rate (spec §4 totals block). */
export const renderTaxLineSchema = z.object({
  rateBp: z.number().int(),
  baseMinor: z.number().int(),
  taxMinor: z.number().int(),
});
export type RenderTaxLine = z.infer<typeof renderTaxLineSchema>;

export const renderTotalsSchema = z.object({
  subtotalMinor: z.number().int(),
  discountTotalMinor: z.number().int().default(0),
  taxLines: z.array(renderTaxLineSchema).default([]),
  taxTotalMinor: z.number().int().default(0),
  grandTotalMinor: z.number().int(),
  /** What the document asks for now — equals grandTotal for a plain invoice, 0 for
   * a receipt, may differ once deposits/credits exist. */
  amountDueMinor: z.number().int(),
});
export type RenderTotals = z.infer<typeof renderTotalsSchema>;

export const renderBankDetailsSchema = z.object({
  bankName: z.string().nullable().default(null),
  accountName: z.string().nullable().default(null),
  iban: z.string().nullable().default(null),
  swift: z.string().nullable().default(null),
  accountNumber: z.string().nullable().default(null),
});
export type RenderBankDetails = z.infer<typeof renderBankDetailsSchema>;

export const invoiceRenderDataSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES).default('INVOICE'),
  /** Content language for the printed labels (spec §10) — independent of the app UI. */
  language: z.enum(PROFILE_LANGUAGES).default('EN'),
  /** ISO 4217, e.g. "EUR". Drives money formatting. */
  currency: z.string().default('EUR'),

  /** Document number as shown ("INV-2026-0007"). The renderer prints it verbatim. */
  number: z.string(),
  /** ISO date strings (YYYY-MM-DD); the renderer formats them per `language`. */
  issueDate: z.string(),
  /** Invoice/Proforma: payment due. Quote: "valid until". Receipt/Credit note: null. */
  dueDate: z.string().nullable().default(null),
  /** Receipt only — "Paid on". */
  paidDate: z.string().nullable().default(null),
  /** Receipt only — free text ("Bank transfer", "Cash"). */
  paymentMethod: z.string().nullable().default(null),
  /** Credit note only — the original invoice number it corrects. */
  creditNoteRef: z.string().nullable().default(null),
  /** Optional buyer reference / PO number. */
  reference: z.string().nullable().default(null),

  business: renderPartySchema,
  /** Business logo URL (root-relative or absolute); resolved against `assetBaseUrl`. */
  businessLogoUrl: z.string().nullable().default(null),
  client: renderPartySchema,

  lineItems: z.array(renderLineItemSchema),
  totals: renderTotalsSchema,

  notes: z.string().nullable().default(null),
  bankDetails: renderBankDetailsSchema.nullable().default(null),
  /** Footer / thank-you line. */
  footerText: z.string().nullable().default(null),
  /** Label under the signature line ("Authorised signature"). */
  signatureLabel: z.string().nullable().default(null),
});
export type InvoiceRenderData = z.infer<typeof invoiceRenderDataSchema>;
