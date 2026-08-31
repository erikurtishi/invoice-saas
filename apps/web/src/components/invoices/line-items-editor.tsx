import {
  amountStringToMinor,
  computeLineItem,
  minorToAmountString,
  percentStringToBp,
  type ProductResponse,
} from '@invoice-saas/shared';
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../lib/cn';
import { ProductPicker } from '../products/product-picker';
import { Button, Input } from '../ui';
import { emptyRow, type LineRow, qtyStringToMilli, rowFromProduct } from './line-items';

const GRID =
  'grid grid-cols-[1.4rem_minmax(0,1fr)_5rem_4rem_7rem_4.5rem_4.5rem_7rem_2rem] items-start gap-2';

/** 40px hit area — meets the touch-target minimum on the card layout (X.2.6). */
const touchIcon =
  'flex size-10 items-center justify-center rounded-md text-muted-foreground ' +
  'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring disabled:opacity-30 disabled:hover:bg-transparent';

/** The non-description inputs, shared by the desktop grid and the mobile cards so
 *  the two layouts can't drift apart. `unit` is free text; the rest are decimal. */
const NUMERIC_FIELDS = [
  { key: 'unit', labelKey: 'invoices.liColUnit', inputMode: undefined, placeholder: undefined },
  { key: 'qtyInput', labelKey: 'invoices.liColQty', inputMode: 'decimal', placeholder: undefined },
  { key: 'priceInput', labelKey: 'invoices.liColPrice', inputMode: 'decimal', placeholder: '0.00' },
  { key: 'taxInput', labelKey: 'invoices.liColTax', inputMode: 'decimal', placeholder: '0' },
  {
    key: 'discountInput',
    labelKey: 'invoices.liColDiscount',
    inputMode: 'decimal',
    placeholder: '0',
  },
] as const satisfies readonly {
  key: keyof Pick<LineRow, 'unit' | 'qtyInput' | 'priceInput' | 'taxInput' | 'discountInput'>;
  labelKey: `invoices.${string}`;
  inputMode: 'decimal' | undefined;
  placeholder: string | undefined;
}[];

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
 *
 * Two layouts (X.2.3): a dense grid table at `md` and up, and one stacked card
 * per row below it so the fields never cram into a horizontal scroll on a phone.
 * X.7.7: zero rows shows a helpful placeholder, not a broken table.
 */
export function LineItemsEditor({ rows, onChange, currency, disabled }: LineItemsEditorProps) {
  const { t } = useTranslation();
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

  const isDisabled = disabled ?? false;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{t('invoices.liHeading')}</h2>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">{t('invoices.liEmptyTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('invoices.liEmptyBody')}</p>
        </div>
      ) : (
        <>
          {/* Desktop / tablet-landscape: dense grid. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <div className="min-w-[720px]">
              <div
                className={`${GRID} border-b border-border bg-muted/40 px-2 py-2 text-xs font-medium text-muted-foreground`}
              >
                <span />
                <span>{t('invoices.liColDescription')}</span>
                <span>{t('invoices.liColUnit')}</span>
                <span>{t('invoices.liColQty')}</span>
                <span>{t('invoices.liColPrice')}</span>
                <span>{t('invoices.liColTax')}</span>
                <span>{t('invoices.liColDiscount')}</span>
                <span className="text-right">{t('invoices.liColAmount')}</span>
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
                    aria-label={`${t('invoices.liColDescription')} ${index + 1}`}
                    value={row.description}
                    disabled={isDisabled}
                    onChange={(e) => patch(index, { description: e.target.value })}
                  />
                  {NUMERIC_FIELDS.map((field) => (
                    <Input
                      key={field.key}
                      aria-label={`${t(field.labelKey)} ${index + 1}`}
                      inputMode={field.inputMode}
                      placeholder={field.placeholder}
                      value={row[field.key]}
                      disabled={isDisabled}
                      onChange={(e) => patch(index, { [field.key]: e.target.value })}
                    />
                  ))}
                  <span className="pt-2 text-right text-sm tabular-nums text-foreground">
                    {rowAmount(row)}
                  </span>

                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      aria-label={`${t('invoices.liMoveUp')} ${index + 1}`}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={index === 0 || isDisabled}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`${t('invoices.liMoveDown')} ${index + 1}`}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={index === rows.length - 1 || isDisabled}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`${t('invoices.liRemove')} ${index + 1}`}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-30"
                      disabled={isDisabled}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Phone / tablet-portrait: one card per row. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((row, index) => (
              <li
                key={row.key}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('invoices.liColAmount')}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {rowAmount(row)}
                  </span>
                </div>

                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  {t('invoices.liColDescription')}
                  <Input
                    className="text-sm"
                    value={row.description}
                    disabled={isDisabled}
                    onChange={(e) => patch(index, { description: e.target.value })}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  {NUMERIC_FIELDS.map((field) => (
                    <label
                      key={field.key}
                      className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
                    >
                      {t(field.labelKey)}
                      <Input
                        className="text-sm"
                        inputMode={field.inputMode}
                        placeholder={field.placeholder}
                        value={row[field.key]}
                        disabled={isDisabled}
                        onChange={(e) => patch(index, { [field.key]: e.target.value })}
                      />
                    </label>
                  ))}
                </div>

                <div className="flex items-center gap-1 border-t border-border pt-2">
                  <button
                    type="button"
                    aria-label={`${t('invoices.liMoveUp')} ${index + 1}`}
                    className={touchIcon}
                    disabled={index === 0 || isDisabled}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${t('invoices.liMoveDown')} ${index + 1}`}
                    className={touchIcon}
                    disabled={index === rows.length - 1 || isDisabled}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${t('invoices.liRemove')} ${index + 1}`}
                    className={cn(touchIcon, 'ml-auto hover:text-destructive')}
                    disabled={isDisabled}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[16rem] flex-1">
          <ProductPicker
            onSelect={addProduct}
            currencyCode={currency}
            placeholder={t('invoices.liAddFromLibrary')}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addBlank} disabled={isDisabled}>
          <Plus className="size-4" aria-hidden />
          {t('invoices.liAddLine')}
        </Button>
      </div>
    </section>
  );
}
