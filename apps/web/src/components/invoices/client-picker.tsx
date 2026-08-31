import type { ClientResponse } from '@invoice-saas/shared';
import { Building2, Check, Loader2, Plus, Search, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useClients } from '../../features/clients/use-clients';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { cn } from '../../lib/cn';
import { toUserMessage } from '../../lib/error-message';
import { ClientFormDialog } from '../clients/client-form-dialog';
import { Button, Input } from '../ui';

const PAGE_SIZE = 8;

export interface ClientPickerProps {
  /** Currently selected client id, or null. */
  value: string | null;
  onChange: (client: ClientResponse | null) => void;
  /** The already-resolved client for `value` (so the chip shows without a fetch). */
  selected?: ClientResponse | null;
  invalid?: boolean;
  id?: string | undefined;
  'aria-describedby'?: string | undefined;
}

/**
 * Invoice client picker (backlog 4.2.1). A typeahead over saved clients plus an
 * inline "add a new client" that reuses `<ClientFormDialog>` (2.1.5 — no
 * navigation away) and selects the new client on save. Mirrors
 * `components/products/product-picker.tsx`; once a client is chosen it collapses
 * to a chip with Change / Clear.
 */
export function ClientPicker({
  value,
  onChange,
  selected,
  invalid,
  id,
  'aria-describedby': describedBy,
}: ClientPickerProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listboxId = useId();

  const search = useDebouncedValue(input.trim(), 250);
  const searchActive = search.length > 0;
  const query = useClients({ search: search || undefined, pageSize: PAGE_SIZE });
  const results = query.data?.items ?? [];
  const showList = open && searchActive;

  const choose = (client: ClientResponse | undefined) => {
    if (!client) return;
    onChange(client);
    setInput('');
    setOpen(false);
    setActiveIndex(0);
  };

  if (value && selected) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-md border px-3 py-2',
          invalid ? 'border-destructive' : 'border-input',
        )}
        aria-label={t('invoices.clientSelected')}
      >
        <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{selected.name}</p>
          {selected.email && (
            <p className="truncate text-xs text-muted-foreground">{selected.email}</p>
          )}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          <X className="size-4" aria-hidden />
          {t('invoices.clientClear')}
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={id}
            className="pl-9"
            type="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-label={t('invoices.clientSearchLabel')}
            aria-describedby={describedBy}
            invalid={invalid ?? false}
            placeholder={t('invoices.clientSearchPlaceholder')}
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
            onKeyDown={(e) => {
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
            }}
          />
        </div>
        <Button type="button" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" aria-hidden />
          {t('invoices.clientAddNew')}
        </Button>
      </div>

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          onMouseDown={(e) => {
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {query.isPending && query.isFetching && (
            <li className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t('invoices.clientSearching')}
            </li>
          )}
          {query.isError && (
            <li className="px-2 py-3 text-sm text-destructive" role="alert">
              {toUserMessage(query.error) || t('invoices.clientSearchError')}
            </li>
          )}
          {!query.isPending && !query.isError && results.length === 0 && (
            <li className="flex items-center justify-between gap-3 px-2 py-3 text-sm text-muted-foreground">
              <span>{t('invoices.clientNothingFound')}</span>
              <button
                type="button"
                className="rounded font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setDialogOpen(true)}
              >
                {t('invoices.clientAddNew')}
              </button>
            </li>
          )}
          {results.map((client, index) => (
            <li key={client.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors',
                  index === activeIndex ? 'bg-muted' : 'hover:bg-muted',
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(client)}
              >
                <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {client.name}
                </span>
                {client.email && (
                  <span className="shrink-0 truncate text-xs text-muted-foreground">
                    {client.email}
                  </span>
                )}
                {value === client.id && (
                  <Check className="size-4 shrink-0 text-primary" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ClientFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={(client) => onChange(client)}
      />
    </div>
  );
}
