import type { DocumentType, RenderLineItem, RenderTaxLine, RenderTotals } from './invoice-data.js';

/**
 * The invoice totals calculator. This is the **one** implementation — the live
 * preview and the server (source of truth, 4.2.3) both call it, so a "looks fine,
 * prints wrong" total mismatch can't happen (CLAUDE.md: one shared function).
 *
 * All integer minor units (decision D17). **Rounding policy is settled by decision
 * D20 (backlog 4.1.2): line-level, half-up.** Per line, in order:
 *   lineSubtotal = round(qty × unitPrice)
 *   lineDiscount = round(lineSubtotal × discountBp / 10000)
 *   lineTax      = round((lineSubtotal − lineDiscount) × taxRateBp / 10000)
 * Document totals are integer sums of those already-rounded line amounts; the
 * per-rate tax summary sums line tax within each rate. Document-level rounding was
 * rejected (D20) — it breaks `printed line tax == base × rate`. Any future change
 * to the policy changes only this file.
 */

/** A line as entered on the invoice form — before any amount is computed. */
export interface RawLineItem {
  description: string;
  /** 1000 = one unit. */
  quantityMilli: number;
  unit?: string | null;
  unitPriceMinor: number;
  /** Basis points; 0 = no tax. */
  taxRateBp?: number;
  /** Basis points of the line subtotal; 0 = no discount. */
  discountBp?: number;
}

const roundMinor = (value: number): number => Math.round(value);

export function computeLineItem(raw: RawLineItem): RenderLineItem {
  const taxRateBp = raw.taxRateBp ?? 0;
  const discountBp = raw.discountBp ?? 0;

  const lineSubtotalMinor = roundMinor((raw.quantityMilli / 1000) * raw.unitPriceMinor);
  const lineDiscountMinor = roundMinor((lineSubtotalMinor * discountBp) / 10000);
  const taxableMinor = lineSubtotalMinor - lineDiscountMinor;
  const lineTaxMinor = roundMinor((taxableMinor * taxRateBp) / 10000);

  return {
    description: raw.description,
    quantityMilli: raw.quantityMilli,
    unit: raw.unit ?? null,
    unitPriceMinor: raw.unitPriceMinor,
    taxRateBp,
    discountBp,
    lineSubtotalMinor,
    lineDiscountMinor,
    lineTaxMinor,
    lineTotalMinor: taxableMinor + lineTaxMinor,
  };
}

export interface ComputedInvoice {
  lineItems: RenderLineItem[];
  totals: RenderTotals;
}

export function computeInvoiceTotals(
  rawLineItems: RawLineItem[],
  options: { documentType?: DocumentType } = {},
): ComputedInvoice {
  const lineItems = rawLineItems.map(computeLineItem);

  const subtotalMinor = sum(lineItems, (l) => l.lineSubtotalMinor);
  const discountTotalMinor = sum(lineItems, (l) => l.lineDiscountMinor);
  const taxTotalMinor = sum(lineItems, (l) => l.lineTaxMinor);
  const grandTotalMinor = subtotalMinor - discountTotalMinor + taxTotalMinor;

  // Group tax by rate for the summary block; skip untaxed lines.
  const byRate = new Map<number, RenderTaxLine>();
  for (const line of lineItems) {
    if (line.taxRateBp === 0) continue;
    const base = line.lineSubtotalMinor - line.lineDiscountMinor;
    const existing = byRate.get(line.taxRateBp);
    if (existing) {
      existing.baseMinor += base;
      existing.taxMinor += line.lineTaxMinor;
    } else {
      byRate.set(line.taxRateBp, {
        rateBp: line.taxRateBp,
        baseMinor: base,
        taxMinor: line.lineTaxMinor,
      });
    }
  }
  const taxLines = [...byRate.values()].sort((a, b) => a.rateBp - b.rateBp);

  const amountDueMinor = options.documentType === 'RECEIPT' ? 0 : grandTotalMinor;

  return {
    lineItems,
    totals: {
      subtotalMinor,
      discountTotalMinor,
      taxLines,
      taxTotalMinor,
      grandTotalMinor,
      amountDueMinor,
    },
  };
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}
