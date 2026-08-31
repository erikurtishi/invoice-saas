import { useQueryClient } from '@tanstack/react-query';
import {
  type BusinessProfileResponse,
  type ClientResponse,
  computeInvoiceTotals,
  type InvoiceInput,
  invoiceInputSchema,
  type InvoiceResponse,
  type InvoiceTotalsResponse,
  type TemplateConfig,
  type TemplateResponse,
} from '@invoice-saas/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { invoiceKeys, useUpdateInvoiceDraft } from '../../features/invoices/use-invoices';
import { useBeforeUnload } from '../../hooks/use-before-unload';
import { useToast } from '../../hooks/use-toast';
import { toUserMessage } from '../../lib/error-message';
import { HttpError } from '../../lib/http-error';
import { FormBanner } from '../form/form-banner';
import { Button, ConfirmDialog } from '../ui';
import { InvoiceActions } from './invoice-actions';
import { InvoiceFormFields } from './invoice-form-fields';
import {
  type HeaderState,
  headerFromInvoice,
  rowsFromInvoice,
  SCRATCH,
  syntheticClientFromInvoice,
  toInvoiceInputPayload,
} from './invoice-form-state';
import { type LineRow, rowsToLineItems } from './line-items';

export interface InvoiceEditFormProps {
  invoice: InvoiceResponse;
  profile: BusinessProfileResponse;
  templates: TemplateResponse[];
  onSaved: (invoice: InvoiceResponse) => void;
  onCancel: () => void;
}

/**
 * Editing a saved invoice (backlog Epic 4.4). Save/Cancel semantics per spec §6:
 * Save (`PATCH /invoices/:id`) is the only thing that persists; Cancel discards
 * and leaves the saved row untouched; Download / Send here render the *current
 * edits* without saving (`<InvoiceActions draft={payload}>`). Document type is
 * locked (4.4.2). The form body is shared with the create flow.
 */
export function InvoiceEditForm({
  invoice,
  profile,
  templates,
  onSaved,
  onCancel,
}: InvoiceEditFormProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const save = useUpdateInvoiceDraft();

  const [header, setHeader] = useState<HeaderState>(() => headerFromInvoice(invoice));
  const [rows, setRows] = useState<LineRow[]>(() => rowsFromInvoice(invoice));
  const [selectedClient, setSelectedClient] = useState<ClientResponse | null>(() =>
    syntheticClientFromInvoice(invoice),
  );
  const [templateChoice, setTemplateChoice] = useState<string>(invoice.templateId ?? SCRATCH);
  const [inlineName, setInlineName] = useState('');
  const [inlineConfig, setInlineConfig] = useState<TemplateConfig>(() => invoice.templateConfig);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const lineItems = useMemo(() => rowsToLineItems(rows), [rows]);

  const payload = useMemo<InvoiceInput>(
    () =>
      toInvoiceInputPayload({
        header,
        templateChoice,
        inlineName,
        inlineConfig,
        lineItems,
        lockedDocumentType: invoice.documentType,
      }),
    [header, templateChoice, inlineName, inlineConfig, lineItems, invoice.documentType],
  );

  const [baselineJson] = useState(() => JSON.stringify(payload));
  const dirty = JSON.stringify(payload) !== baselineJson;
  useBeforeUnload(dirty);

  const totals = useMemo<InvoiceTotalsResponse>(() => {
    const { totals: computed } = computeInvoiceTotals(
      lineItems.map((li) => ({
        description: li.description,
        quantityMilli: li.quantityMilli,
        unit: li.unit ?? null,
        unitPriceMinor: li.unitPriceMinor,
        taxRateBp: li.taxRateBp,
        discountBp: li.discountBp,
      })),
      { documentType: invoice.documentType },
    );
    return {
      subtotalMinor: computed.subtotalMinor,
      discountTotalMinor: computed.discountTotalMinor,
      taxTotalMinor: computed.taxTotalMinor,
      grandTotalMinor: computed.grandTotalMinor,
      amountDueMinor: computed.amountDueMinor,
      taxLines: computed.taxLines,
    };
  }, [lineItems, invoice.documentType]);

  const setField = <K extends keyof HeaderState>(key: K, value: HeaderState[K]) => {
    setHeader((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  const handleCancel = () => {
    if (dirty) setConfirmCancel(true);
    else onCancel();
  };

  const handleSave = async () => {
    setFormError(null);
    const errors: Record<string, string> = {};
    if (!payload.clientId) errors.clientId = t('invoices.clientRequired');

    const parsed = invoiceInputSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        if (path && !path.startsWith('lineItems')) errors[path] = issue.message;
      }
      if (parsed.error.issues.some((i) => i.path[0] === 'lineItems'))
        setFormError(t('invoices.fixErrors'));
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (!formError) setFormError(t('invoices.fixErrors'));
      return;
    }

    try {
      const saved = await save.mutateAsync({ id: invoice.id, input: payload });
      void qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      toast.success(t('invoices.savedToast'));
      onSaved(saved);
    } catch (err) {
      if (err instanceof HttpError && err.fields) {
        const mapped: Record<string, string> = {};
        for (const [k, msgs] of Object.entries(err.fields)) {
          if (msgs[0]) mapped[k] = msgs[0];
        }
        setFieldErrors(mapped);
        setFormError(t('invoices.fixErrors'));
      } else {
        setFormError(toUserMessage(err) || t('invoices.saveFailed'));
      }
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm">
          <span className="font-medium text-foreground">
            {invoice.number ?? invoice.documentType}
          </span>
          {dirty && (
            <span className="ml-2 text-xs text-muted-foreground">{t('invoices.unsaved')}</span>
          )}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            isLoading={save.isPending}
            disabled={!dirty}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>

      {formError && <FormBanner variant="error">{formError}</FormBanner>}

      <InvoiceFormFields
        profile={profile}
        templates={templates}
        header={header}
        setField={setField}
        rows={rows}
        onRowsChange={setRows}
        selectedClient={selectedClient}
        onClientChange={setSelectedClient}
        templateChoice={templateChoice}
        onTemplateChoiceChange={setTemplateChoice}
        inlineName={inlineName}
        onInlineNameChange={setInlineName}
        inlineConfig={inlineConfig}
        onInlineConfigChange={setInlineConfig}
        fallbackTemplateConfig={invoice.templateConfig}
        lockDocumentType
        fieldErrors={fieldErrors}
        payload={payload}
        totals={totals}
        previewNumber={invoice.number ?? undefined}
      />

      <div className="rounded-lg border border-border p-4">
        <p className="mb-3 text-xs text-muted-foreground">{t('invoices.actionsHint')}</p>
        <InvoiceActions invoice={invoice} draft={payload} />
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t('invoices.editDiscardTitle')}
        description={t('invoices.editDiscardBody')}
        confirmLabel={t('invoices.discardConfirm')}
        destructive
        onConfirm={onCancel}
      />
    </div>
  );
}
