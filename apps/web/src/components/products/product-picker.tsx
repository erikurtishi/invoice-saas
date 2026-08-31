import { minorToAmountString, type ProductResponse } from '@invoice-saas/shared';
import { Loader2, Package, Search } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useProducts } from '../../features/products/use-products';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { cn } from '../../lib/cn';
import { toUserMessage } from '../../lib/error-message';
import { Input } from '../ui';

const PAGE_SIZE = 8;

export interface ProductPickerProps {
  /** Called with the chosen product; the picker then clears its input. */
  onSelect: (product: ProductResponse) => void;
  /** Products to hide from results (e.g. already on the invoice). */
  excludeIds?: readonly string[];
  /** Currency code to show next to each price (the invoice's currency in Phase 4). */
  currencyCode?: string | undefined;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Typeahead that resolves to a saved product (backlog 2.2.5). Built for the Phase
 * 4 line-item editor: type, pick, and the caller inserts a line. Dependency-free —
 * an input plus an absolutely-positioned listbox — with the "nothing found" state
 * X.7.6 asks for (here: a message + "Clear", since in a typeahead clearing the
 * query *is* clearing the filter).
 */
export function ProductPicker({
  onSelect,
  excludeIds,
  currencyCode,
  placeholder,
  className,
  autoFocus = false,
}: ProductPickerProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const listboxId = useId();
  const search = useDebouncedValue(input.trim(), 250);
  const searchActive = search.length > 0;

  const query = useProducts(
    { search: search || undefined, pageSize: PAGE_SIZE },
    { enabled: open && searchActive },
  );

  const results = (query.data?.items ?? []).filter((p) => !excludeIds?.includes(p.id));
  const showList = open && searchActive;

  const choose = (product: ProductResponse | undefined) => {
    if (!product) return;
    onSelect(product);
    setInput('');
    setOpen(false);
    setActiveIndex(0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!showList) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          className="pl-9"
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label={t('invoices.productSearchLabel')}
          autoFocus={autoFocus}
          placeholder={placeholder ?? t('invoices.productSearchPlaceholder')}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(e.target.value.trim().length > 0);
            setActiveIndex(0);
          }}
          onFocus={() => {
            if (input.trim().length > 0) setOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          onMouseDown={(e) => {
            // Keep the input focused so its blur-close doesn't beat the click.
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {query.isPending && query.isFetching && (
            <li className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t('invoices.productSearching')}
            </li>
          )}

          {query.isError && (
            <li className="px-2 py-3 text-sm text-destructive" role="alert">
              {toUserMessage(query.error) || t('invoices.productSearchError')}
            </li>
          )}

          {!query.isPending && !query.isError && results.length === 0 && (
            <li className="flex items-center justify-between gap-3 px-2 py-3 text-sm text-muted-foreground">
              <span>{t('invoices.productNothingFound')}</span>
              <button
                type="button"
                className="rounded font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setInput('');
                  setOpen(false);
                }}
              >
                {t('invoices.productClear')}
              </button>
            </li>
          )}

          {results.map((product, index) => (
            <li key={product.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors',
                  index === activeIndex ? 'bg-muted' : 'hover:bg-muted',
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(product)}
              >
                <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {product.name}
                </span>
                {product.defaultPriceMinor != null && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {minorToAmountString(product.defaultPriceMinor)}
                    {currencyCode ? ` ${currencyCode}` : ''}
                    {product.unit ? ` / ${product.unit}` : ''}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
