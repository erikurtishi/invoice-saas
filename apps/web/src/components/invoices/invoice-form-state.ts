import {
  type BusinessProfileResponse,
  bpToPercentString,
  type ClientResponse,
  type DocumentType,
  type InvoiceInput,
  type InvoiceLineItemInput,
  type InvoiceResponse,
  minorToAmountString,
  type TemplateConfig,
} from '@invoice-saas/shared';

import { emptyRow, type LineRow, milliToQtyString } from './line-items';

/**
 * Pure state helpers shared by the create form (`invoice-form.tsx`, Epic 4.2) and
 * the edit form (`invoice-edit-form.tsx`, Epic 4.4). Kept out of the component
 * files so Fast Refresh stays component-only there.
 */

/** Scalar header fields held in form state — line items, the template link and
 * the inline design are tracked separately and merged into the payload. */
export type HeaderState = Omit<InvoiceInput, 'lineItems' | 'templateId' | 'newTemplate'>;

export const SCRATCH = '__scratch__';

export const PAPER_SIZES = ['A4', 'LETTER', 'LEGAL', 'A5'] as const;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Fresh header for a new invoice — defaults pulled from the business profile. */
export function initialHeader(profile: BusinessProfileResponse): HeaderState {
  const issueDate = todayIso();
  return {
    documentType: 'INVOICE',
    language: profile.invoiceLanguage,
    currency: profile.defaultCurrency,
    paperSize: profile.defaultPaperSize,
    clientId: null,
    issueDate,
    dueDate: addDays(issueDate, profile.defaultPaymentTermsDays),
    paidDate: null,
    paymentMethod: null,
    creditNoteRef: null,
    creditNoteOfId: null,
    reference: null,
    notes: null,
    footerText: null,
    signatureLabel: null,
  };
}

/** Header seeded from a saved invoice (edit mode). */
export function headerFromInvoice(invoice: InvoiceResponse): HeaderState {
  return {
    documentType: invoice.documentType,
    language: invoice.language,
    currency: invoice.currency,
    paperSize: invoice.paperSize,
    clientId: invoice.clientId,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    paidDate: invoice.paidDate,
    paymentMethod: invoice.paymentMethod,
    creditNoteRef: invoice.creditNoteRef,
    creditNoteOfId: invoice.creditNoteOfId,
    reference: invoice.reference,
    notes: invoice.notes,
    footerText: invoice.footerText,
    signatureLabel: invoice.signatureLabel,
  };
}

/**
 * A stand-in `ClientResponse` built from the invoice's frozen snapshot, for edit
 * mode where the full client record isn't loaded (and may be deleted). The
 * address is held as one `FREE_TEXT` blob — exactly how the snapshot stores it —
 * so `<InvoicePreviewPanel>` and the picker chip render it unchanged.
 */
export function syntheticClientFromInvoice(invoice: InvoiceResponse): ClientResponse | null {
  if (!invoice.clientId) return null;
  return {
    id: invoice.clientId,
    name: invoice.client.name ?? '',
    email: invoice.client.email,
    taxId: invoice.client.taxId,
    addressMode: 'FREE_TEXT',
    addressLine1: null,
    addressLine2: null,
    city: null,
    postalCode: null,
    country: null,
    addressText: invoice.client.address,
    currency: null,
    notes: null,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}

/**
 * Assemble the wire `InvoiceInput` from the form's separate pieces of state. The
 * one place that merge happens, so the create form, the edit form and their
 * dirty-tracking baselines all agree on the shape.
 */
export function toInvoiceInputPayload(args: {
  header: HeaderState;
  templateChoice: string;
  inlineName: string;
  inlineConfig: TemplateConfig;
  lineItems: InvoiceLineItemInput[];
  /** Edit mode: document type can't change after issue (4.4.2). */
  lockedDocumentType?: DocumentType;
}): InvoiceInput {
  const isScratch = args.templateChoice === SCRATCH;
  return {
    ...args.header,
    documentType: args.lockedDocumentType ?? args.header.documentType,
    templateId: isScratch ? null : args.templateChoice,
    newTemplate: isScratch
      ? { name: args.inlineName.trim() || 'Untitled template', config: args.inlineConfig }
      : null,
    lineItems: args.lineItems,
  };
}

/** Saved line items → editor rows (inverse of `rowsToLineItems`). */
export function rowsFromInvoice(invoice: InvoiceResponse): LineRow[] {
  if (invoice.lineItems.length === 0) return [];
  return invoice.lineItems.map((li, index) => ({
    ...emptyRow(),
    key: li.id || `row-${index}`,
    productId: li.productId,
    description: li.description,
    unit: li.unit ?? '',
    qtyInput: milliToQtyString(li.quantityMilli),
    priceInput: minorToAmountString(li.unitPriceMinor),
    taxInput: li.taxRateBp > 0 ? bpToPercentString(li.taxRateBp) : '',
    discountInput: li.discountBp > 0 ? bpToPercentString(li.discountBp) : '',
  }));
}
