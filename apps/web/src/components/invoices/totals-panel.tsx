import {
  bpToPercentString,
  DOCUMENT_TYPE_FIELDS,
  type DocumentType,
  type InvoiceTotalsResponse,
  minorToAmountString,
} from '@invoice-saas/shared';

import { useTranslation } from 'react-i18next';

import { cn } from '../../lib/cn';

export interface TotalsPanelProps {
  totals: InvoiceTotalsResponse;
  currency: string;
  documentType: DocumentType;
  /** Local (display-only) totals are showing; the server hasn't confirmed yet. */
  syncing?: boolean;
}

function money(minor: number, currency: string): string {
  return `${minorToAmountString(minor)} ${currency}`;
}

/**
 * The invoice totals panel (backlog 4.2.3). The server is the source of truth —
 * these numbers come from `POST /invoices/calculate` or a draft-save echo; the
 * form only computes locally to avoid a flash of stale figures while typing
 * (`syncing`).
 */
export function TotalsPanel({ totals, currency, documentType, syncing }: TotalsPanelProps) {
  const { t } = useTranslation();
  const amountLine = DOCUMENT_TYPE_FIELDS[documentType].amountLine;

  return (
    <section
      className="rounded-lg border border-border bg-card p-4"
      aria-live="polite"
      aria-busy={syncing ?? false}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t('invoices.totalsHeading')}</h2>
        {syncing && (
          <span className="text-xs text-muted-foreground">{t('invoices.totalsSyncing')}</span>
        )}
      </div>

      <dl className={cn('mt-3 space-y-1.5 text-sm', syncing && 'opacity-60')}>
        <Row label={t('invoices.subtotal')} value={money(totals.subtotalMinor, currency)} />

        {totals.discountTotalMinor > 0 && (
          <Row
            label={t('invoices.discount')}
            value={`− ${money(totals.discountTotalMinor, currency)}`}
          />
        )}

        {totals.taxLines.map((line) => (
          <Row
            key={line.rateBp}
            label={t('invoices.taxAt', { rate: bpToPercentString(line.rateBp) })}
            value={money(line.taxMinor, currency)}
            muted
          />
        ))}

        {totals.taxLines.length !== 1 && totals.taxTotalMinor > 0 && (
          <Row label={t('invoices.taxTotal')} value={money(totals.taxTotalMinor, currency)} />
        )}

        <div className="!mt-3 border-t border-border pt-2">
          <Row
            label={t('invoices.grandTotal')}
            value={money(totals.grandTotalMinor, currency)}
            emphasis
          />
          {amountLine === 'amountDue' && (
            <Row
              label={t('invoices.amountDue')}
              value={money(totals.amountDueMinor, currency)}
              emphasis
            />
          )}
          {amountLine === 'amountCredited' && (
            <Row
              label={t('invoices.amountCredited')}
              value={money(totals.grandTotalMinor, currency)}
              emphasis
            />
          )}
        </div>
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">{t('invoices.totalsServerNote')}</p>
    </section>
  );
}

function Row({
  label,
  value,
  muted,
  emphasis,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt
        className={cn(
          muted && 'text-muted-foreground',
          emphasis && 'font-semibold text-foreground',
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          'tabular-nums',
          muted && 'text-muted-foreground',
          emphasis ? 'font-semibold text-foreground' : 'text-foreground',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
