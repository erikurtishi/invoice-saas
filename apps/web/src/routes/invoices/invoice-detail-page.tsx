import { invoiceResponseToRenderData, type InvoiceResponse } from '@invoice-saas/shared';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { InvoiceHistoryTimeline } from '../../components/history/invoice-history-timeline';
import { InvoiceActions } from '../../components/invoices/invoice-actions';
import { InvoiceRecordActions } from '../../components/invoices/invoice-record-actions';
import { TotalsPanel } from '../../components/invoices/totals-panel';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonForm } from '../../components/state/skeletons';
import { InvoicePreview } from '../../components/template/invoice-preview';
import { Button } from '../../components/ui';
import { useInvoice } from '../../features/invoices/use-invoices';
import { useFormatters } from '../../i18n/format';

/**
 * The saved-invoice preview screen (backlog Epic 4.3, spec §6). Shows the invoice
 * rendered by the shared engine — byte-for-byte what the PDF is made from — with
 * exactly two actions: Download and Send (`<InvoiceActions>`). Record actions —
 * Edit / Duplicate / Delete (Epic 4.4) — sit in the header.
 */
export function InvoiceDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = useInvoice(id);

  return (
    <div className="mx-auto max-w-6xl">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 mb-4"
        onClick={() => void navigate('/console/invoices')}
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('invoices.detailBack')}
      </Button>

      <QueryBoundary
        name="invoice-detail"
        query={query}
        loading={<SkeletonForm fields={8} />}
        isEmpty={() => false}
      >
        {(invoice) => <DetailBody invoice={invoice} />}
      </QueryBoundary>
    </div>
  );
}

function DetailBody({ invoice }: { invoice: InvoiceResponse }) {
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  const isDraft = invoice.status === 'DRAFT';
  const secondaryDateLabel =
    invoice.documentType === 'QUOTE'
      ? t('invoices.validUntil')
      : invoice.documentType === 'RECEIPT'
        ? t('invoices.paidOn')
        : t('invoices.dueDate');
  const secondaryDateValue =
    invoice.documentType === 'RECEIPT' ? invoice.paidDate : invoice.dueDate;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(`docTypes.${invoice.documentType}`)}
            </p>
            <h1 className="text-2xl font-semibold text-foreground">
              {invoice.number ?? t(`docTypes.${invoice.documentType}`)}
            </h1>
          </div>
          <InvoiceRecordActions invoice={invoice} />
        </header>

        {isDraft && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium text-foreground">{t('invoices.draftTitle')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('invoices.draftBody')}</p>
          </div>
        )}

        {invoice.templateMissing && (
          <div
            className="flex gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            role="status"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium text-foreground">{t('invoices.templateMissingTitle')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('invoices.templateMissingBody')}
              </p>
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Meta label={t('invoices.billedTo')} value={invoice.client.name} />
          <Meta label={t('invoices.issueDate')} value={formatDate(invoice.issueDate)} />
          {secondaryDateValue && (
            <Meta label={secondaryDateLabel} value={formatDate(secondaryDateValue)} />
          )}
          {invoice.reference && <Meta label={t('invoices.reference')} value={invoice.reference} />}
        </dl>

        <TotalsPanel
          totals={invoice.totals}
          currency={invoice.currency}
          documentType={invoice.documentType}
        />

        {!isDraft && <InvoiceActions invoice={invoice} />}

        <div className="border-t border-border pt-5">
          <InvoiceHistoryTimeline invoiceId={invoice.id} />
        </div>
      </div>

      <div className="lg:sticky lg:top-4 lg:h-[calc(100dvh-6rem)]">
        <div className="h-full overflow-hidden rounded-lg border border-border">
          <InvoicePreview
            config={invoice.templateConfig}
            data={invoiceResponseToRenderData(invoice)}
            paperSize={invoice.paperSize}
            zoom="fit"
          />
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation();
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value ?? t('common.none')}</dd>
    </div>
  );
}
