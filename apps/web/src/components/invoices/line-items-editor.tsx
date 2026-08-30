import {
  amountStringToMinor,
  computeLineItem,
  minorToAmountString,
  percentStringToBp,
  type ProductResponse,
} from '@invoice-saas/shared';
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react';

import { ProductPicker } from '../products/product-picker';
import { Button, Input } from '../ui';
import { emptyRow, type LineRow, qtyStringToMilli, rowFromProduct } from './line-items';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  heading: 'Line items',
  colDescription: 'Description',
  colUnit: 'Unit',
  colQty: 'Qty',
  colPrice: 'Unit price',
  colTax: 'Tax %',
  colDiscount: 'Disc %',
  colAmount: 'Amount',
  addLine: 'Add a blank line',
  moveUp: 'Move up',
  moveDown: 'Move down',
  remove: 'Remove line',
  emptyTitle: 'No line items yet',
  emptyBody: 'Add a product from your library or a blank line to start.',
  addFromLibrary: 'Add from your product library…',
} as const;

const GRID =
  'grid grid-cols-[1.4rem_minmax(0,1fr)_5rem_4rem_7rem_4.5rem_4.5rem_7rem_2rem] items-start gap-2';

export interface LineItemsEditorProps {
  rows: LineRow[];
  onChange: (rows: LineRow[]) => void;
  /** The invoice currency — shown next to each row total. */
  currency: string;
  disabled?: boolean;
}

/**
 * Line item editor (backlog 4.2.2): add from the product library or a blank row,
 * reorder with up/down, remove, and see each row's live-calculated amount. Money
 * fields bind to decimal strings and convert through `money.ts`; totals for the
 * whole invoice are the `<TotalsPanel>`'s job (server source of truth, 4.2.3).
 * X.7.7: zero rows shows a helpful placeholder, not a broken table.
 */
export function LineItemsEditor({ rows, onChange, currency, disabled }: LineItemsEditorProps) {
  const patch = (index: number, changes: Partial<LineRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  };
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));
  const addBlank = () => onChange([...rows, emptyRow()]);
  const addProduct = (product: ProductResponse) => onChange([...rows, rowFromProduct(product)]);

  const rowAmount = (row: LineRow): string => {
    const line = computeLineItem({
      description: row.description,
      quantityMilli: qtyStringToMilli(row.qtyInput) ?? 0,
      unitPriceMinor: amountStringToMinor(row.priceInput) ?? 0,
      taxRateBp: percentStringToBp(row.taxInput) ?? 0,
      discountBp: percentStringToBp(row.discountInput) ?? 0,
    });
    return `${minorToAmountString(line.lineTotalMinor)} ${currency}`;
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{COPY.heading}</h2>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">{COPY.emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{COPY.emptyBody}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <div className="min-w-[720px]">
            <div
              className={`${GRID} border-b border-border bg-muted/40 px-2 py-2 text-xs font-medium text-muted-foreground`}
            >
              <span />
              <span>{COPY.colDescription}</span>
              <span>{COPY.colUnit}</span>
              <span>{COPY.colQty}</span>
              <span>{COPY.colPrice}</span>
              <span>{COPY.colTax}</span>
              <span>{COPY.colDiscount}</span>
              <span className="text-right">{COPY.colAmount}</span>
              <span />
            </div>

            {rows.map((row, index) => (
              <div
                key={row.key}
                className={`${GRID} border-b border-border px-2 py-2 last:border-b-0`}
              >
                <div className="flex flex-col items-center pt-2 text-muted-foreground">
                  <GripVertical className="size-4" aria-hidden />
                </div>

                <Input
                  aria-label={`${COPY.colDescription} ${index + 1}`}
                  value={row.description}
                  disabled={disabled ?? false}
                  onChange={(e) => patch(index, { description: e.target.value })}
                />
                <Input
                  aria-label={`${COPY.colUnit} ${index + 1}`}
                  value={row.unit}
                  disabled={disabled ?? false}
                  onChange={(e) => patch(index, { unit: e.target.value })}
                />
                <Input
                  aria-label={`${COPY.colQty} ${index + 1}`}
                  inputMode="decimal"
                  value={row.qtyInput}
                  disabled={disabled ?? false}
                  onChange={(e) => patch(index, { qtyInput: e.target.value })}
                />
                <Input
                  aria-label={`${COPY.colPrice} ${index + 1}`}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={row.priceInput}
                  disabled={disabled ?? false}
                  onChange={(e) => patch(index, { priceInput: e.target.value })}
                />
                <Input
                  aria-label={`${COPY.colTax} ${index + 1}`}
                  inputMode="decimal"
                  placeholder="0"
                  value={row.taxInput}
                  disabled={disabled ?? false}
                  onChange={(e) => patch(index, { taxInput: e.target.value })}
                />
                <Input
                  aria-label={`${COPY.colDiscount} ${index + 1}`}
                  inputMode="decimal"
                  placeholder="0"
                  value={row.discountInput}
                  disabled={disabled ?? false}
                  onChange={(e) => patch(index, { discountInput: e.target.value })}
                />
                <span className="pt-2 text-right text-sm tabular-nums text-foreground">
                  {rowAmount(row)}
                </span>

                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    aria-label={`${COPY.moveUp} ${index + 1}`}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={index === 0 || disabled}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${COPY.moveDown} ${index + 1}`}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={index === rows.length - 1 || disabled}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${COPY.remove} ${index + 1}`}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    disabled={disabled ?? false}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[16rem] flex-1">
          <ProductPicker
            onSelect={addProduct}
            currencyCode={currency}
            placeholder={COPY.addFromLibrary}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addBlank}
          disabled={disabled ?? false}
        >
          <Plus className="size-4" aria-hidden />
          {COPY.addLine}
        </Button>
      </div>
    </section>
  );
}
