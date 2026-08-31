import { describe, expect, it } from 'vitest';

import { computeInvoiceTotals, computeLineItem, type RawLineItem } from './invoice-math.js';

/**
 * Invoice totals unit tests (backlog X.5.1 / X.5.4). This is the one shared
 * calculator the live preview and the server both call, and its rounding policy
 * is fixed by decision D20: **line-level, half-up**, in the order subtotal →
 * discount → tax, with document totals as integer sums of already-rounded lines.
 * These tests pin that policy so a refactor can't silently change a printed total.
 */

const line = (over: Partial<RawLineItem> = {}): RawLineItem => ({
  description: 'Item',
  quantityMilli: 1000,
  unitPriceMinor: 10000,
  taxRateBp: 0,
  discountBp: 0,
  ...over,
});

describe('computeLineItem', () => {
  it('multiplies quantity (milli) by unit price', () => {
    const r = computeLineItem(line({ quantityMilli: 2500, unitPriceMinor: 400 }));
    expect(r.lineSubtotalMinor).toBe(1000); // 2.5 × 4.00
    expect(r.lineTotalMinor).toBe(1000);
  });

  it('rounds the subtotal half-up', () => {
    // 3 × 3.335 → 10.005 → rounds to 10.01 (half-up), not 10.00
    expect(
      computeLineItem(line({ quantityMilli: 3000, unitPriceMinor: 333.5 })).lineSubtotalMinor,
    ).toBe(1001);
    // exact .5 at the minor boundary
    expect(
      computeLineItem(line({ quantityMilli: 1500, unitPriceMinor: 1 })).lineSubtotalMinor,
    ).toBe(2); // 1.5 → 2 (half-up)
  });

  it('applies the discount to the subtotal, then tax to the discounted base', () => {
    const r = computeLineItem(line({ unitPriceMinor: 10000, discountBp: 1000, taxRateBp: 1800 }));
    expect(r.lineSubtotalMinor).toBe(10000);
    expect(r.lineDiscountMinor).toBe(1000); // 10% of 100.00
    expect(r.lineTaxMinor).toBe(1620); // 18% of (100.00 − 10.00)
    expect(r.lineTotalMinor).toBe(10620); // 90.00 + 16.20
  });

  it('rounds discount and tax half-up independently', () => {
    // subtotal 100.03, 50% discount → 50.015 → 50.02
    const r = computeLineItem(line({ unitPriceMinor: 10003, discountBp: 5000, taxRateBp: 0 }));
    expect(r.lineDiscountMinor).toBe(5002);
    // taxable 33.33 @ 15% = 4.9995 → 5.00
    const t = computeLineItem(line({ unitPriceMinor: 3333, taxRateBp: 1500 }));
    expect(t.lineTaxMinor).toBe(500);
  });

  it('treats missing tax / discount rates as zero', () => {
    const r = computeLineItem({ description: 'x', quantityMilli: 1000, unitPriceMinor: 500 });
    expect(r.taxRateBp).toBe(0);
    expect(r.discountBp).toBe(0);
    expect(r.lineTotalMinor).toBe(500);
  });
});

describe('computeInvoiceTotals', () => {
  it('sums already-rounded line amounts', () => {
    const { totals } = computeInvoiceTotals([
      line({ unitPriceMinor: 3333, taxRateBp: 1800 }),
      line({ unitPriceMinor: 6667, taxRateBp: 1800 }),
    ]);
    expect(totals.subtotalMinor).toBe(10000);
    expect(totals.taxTotalMinor).toBe(600 + 1200); // 599.94→600, 1200.06→1200
    expect(totals.grandTotalMinor).toBe(11800);
  });

  it('groups tax by rate, sorted ascending, skipping untaxed lines', () => {
    const { totals } = computeInvoiceTotals([
      line({ unitPriceMinor: 10000, taxRateBp: 1800 }),
      line({ unitPriceMinor: 10000, taxRateBp: 500 }),
      line({ unitPriceMinor: 10000, taxRateBp: 1800 }),
      line({ unitPriceMinor: 10000, taxRateBp: 0 }),
    ]);
    expect(totals.taxLines.map((t) => t.rateBp)).toEqual([500, 1800]);
    const t18 = totals.taxLines.find((t) => t.rateBp === 1800)!;
    expect(t18.baseMinor).toBe(20000);
    expect(t18.taxMinor).toBe(3600);
  });

  it('carries the discount total', () => {
    const { totals } = computeInvoiceTotals([line({ unitPriceMinor: 10000, discountBp: 2500 })]);
    expect(totals.discountTotalMinor).toBe(2500);
    expect(totals.grandTotalMinor).toBe(7500);
  });

  it('zeroes amountDue for a RECEIPT (already paid)', () => {
    const { totals } = computeInvoiceTotals([line({ unitPriceMinor: 10000 })], {
      documentType: 'RECEIPT',
    });
    expect(totals.grandTotalMinor).toBe(10000);
    expect(totals.amountDueMinor).toBe(0);
  });

  it('equals grandTotal for a non-receipt', () => {
    const { totals } = computeInvoiceTotals([line({ unitPriceMinor: 10000 })], {
      documentType: 'INVOICE',
    });
    expect(totals.amountDueMinor).toBe(10000);
  });

  it('handles an empty invoice', () => {
    const { totals } = computeInvoiceTotals([]);
    expect(totals).toMatchObject({
      subtotalMinor: 0,
      discountTotalMinor: 0,
      taxTotalMinor: 0,
      grandTotalMinor: 0,
      taxLines: [],
    });
  });
});
