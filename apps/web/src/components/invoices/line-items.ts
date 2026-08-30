import {
  amountStringToMinor,
  bpToPercentString,
  type InvoiceLineItemInput,
  minorToAmountString,
  percentStringToBp,
  type ProductResponse,
} from '@invoice-saas/shared';

/**
 * The line-item editor's row model and the pure conversions between it and the
 * shared `InvoiceLineItemInput` wire shape (backlog 4.2.2). Kept out of the
 * component file so Fast Refresh stays component-only there.
 *
 * A row holds the decimal strings the inputs bind to; money crosses into integer
 * minor units / basis points (decision D17) via `money.ts` only when a row becomes
 * a payload item.
 */

export interface LineRow {
  /** Stable React key — never sent to the server. */
  key: string;
  productId: string | null;
  description: string;
  unit: string;
  qtyInput: string;
  priceInput: string;
  taxInput: string;
  discountInput: string;
}

let rowSeq = 0;
const nextKey = () => `row-${Date.now().toString(36)}-${(rowSeq += 1)}`;

export function emptyRow(): LineRow {
  return {
    key: nextKey(),
    productId: null,
    description: '',
    unit: '',
    qtyInput: '1',
    priceInput: '',
    taxInput: '',
    discountInput: '',
  };
}

export function rowFromProduct(product: ProductResponse): LineRow {
  return {
    key: nextKey(),
    productId: product.id,
    description: product.name,
    unit: product.unit ?? '',
    qtyInput: '1',
    priceInput:
      product.defaultPriceMinor != null ? minorToAmountString(product.defaultPriceMinor) : '',
    taxInput: product.defaultTaxRateBp > 0 ? bpToPercentString(product.defaultTaxRateBp) : '',
    discountInput: '',
  };
}

/** `"2.5"` → `2500` milli-units. `null` for empty / negative / >3 decimals. */
export function qtyStringToMilli(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '' || !/^\d+(\.\d{1,3})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 1000);
}

export function milliToQtyString(milli: number): string {
  return String(milli / 1000);
}

/**
 * Rows with a description become payload line items; blank rows stay in the editor
 * only. Unparseable money coerces to 0 so the live preview / totals still render
 * while the user is mid-type — the shared schema rejects a bad finalize.
 */
export function rowsToLineItems(rows: LineRow[]): InvoiceLineItemInput[] {
  return rows
    .filter((r) => r.description.trim() !== '')
    .map((r) => ({
      productId: r.productId,
      description: r.description.trim(),
      quantityMilli: qtyStringToMilli(r.qtyInput) ?? 0,
      unit: r.unit.trim() === '' ? null : r.unit.trim(),
      unitPriceMinor: amountStringToMinor(r.priceInput) ?? 0,
      taxRateBp: percentStringToBp(r.taxInput) ?? 0,
      discountBp: percentStringToBp(r.discountInput) ?? 0,
    }));
}
