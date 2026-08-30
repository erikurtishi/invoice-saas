import {
  type BusinessProfileResponse,
  type ClientResponse,
  computeInvoiceTotals,
  defaultTemplateConfig,
  type InvoiceInput,
  invoiceInputSchema,
  type InvoiceResponse,
  type InvoiceTotalsResponse,
  type TemplateConfig,
  type TemplateResponse,
} from '@invoice-saas/shared';
import { useEffect, useMemo, useState } from 'react';

import { useInvoiceDraft } from '../../features/invoices/use-invoice-draft';
import { useToast } from '../../hooks/use-toast';
import { HttpError } from '../../lib/http-error';
import { toUserMessage } from '../../lib/error-message';
import { FormBanner } from '../form/form-banner';
import { Button, ConfirmDialog } from '../ui';
import { InvoiceFormFields } from './invoice-form-fields';
import { type HeaderState, initialHeader, SCRATCH } from './invoice-form-state';
import { type LineRow, rowsToLineItems } from './line-items';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  save: 'Save invoice',
  cancel: 'Cancel',
  saving: 'Saving…',
  saved: 'Draft saved',
  saveError: "Draft didn't save — we'll retry",
  fixErrors: 'Check the highlighted fields before saving.',
  issuedToast: (n: string) => `Invoice ${n} saved.`,
  finalizeFailed: "Couldn't save this invoice. Try again.",
  discardTitle: 'Discard this invoice?',
  discardBody: 'It hasn’t been saved. Your draft will be kept but not issued.',
  discardConfirm: 'Discard',
  clientRequired: 'Pick a client for this invoice.',
  templateRequired: 'Pick a template or design one.',
} as const;

export interface InvoiceFormProps {
  profile: BusinessProfileResponse;
  templates: TemplateResponse[];
  onIssued: (invoice: InvoiceResponse) => void;
  onCancel: () => void;
}

/**
 * The invoice *creation* flow (backlog Epic 4.2): compose-time autosave of a
 * DRAFT, then one explicit Save that finalizes it (number + ISSUED). The form
 * body is `<InvoiceFormFields>`, shared with the edit flow (Epic 4.4).
 */
export function InvoiceForm({ profile, templates, onIssued, onCancel }: InvoiceFormProps) {
  const toast = useToast();

  const [header, setHeader] = useState<HeaderState>(() => initialHeader(profile));
  const [rows, setRows] = useState<LineRow[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientResponse | null>(null);

  const defaultTemplateId = templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? SCRATCH;
  const [templateChoice, setTemplateChoice] = useState<string>(defaultTemplateId);
  const [inlineName, setInlineName] = useState('');
  const [inlineConfig, setInlineConfig] = useState<TemplateConfig>(() => defaultTemplateConfig());

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isScratch = templateChoice === SCRATCH;
  const lineItems = useMemo(() => rowsToLineItems(rows), [rows]);

  const payload = useMemo<InvoiceInput>(
    () => ({
      ...header,
      templateId: isScratch ? null : templateChoice,
      newTemplate: isScratch
        ? { name: inlineName.trim() || 'Untitled template', config: inlineConfig }
        : null,
      lineItems,
    }),
    [header, isScratch, templateChoice, inlineName, inlineConfig, lineItems],
  );

  const draft = useInvoiceDraft();
  const { queueSave } = draft;
  useEffect(() => {
    queueSave(payload);
  }, [payload, queueSave]);

  const localTotals = useMemo<InvoiceTotalsResponse>(() => {
    const { totals } = computeInvoiceTotals(
      lineItems.map((li) => ({
        description: li.description,
        quantityMilli: li.quantityMilli,
        unit: li.unit ?? null,
        unitPriceMinor: li.unitPriceMinor,
        taxRateBp: li.taxRateBp,
        discountBp: li.discountBp,
      })),
      { documentType: header.documentType },
    );
    return {
      subtotalMinor: totals.subtotalMinor,
      discountTotalMinor: totals.discountTotalMinor,
      taxTotalMinor: totals.taxTotalMinor,
      grandTotalMinor: totals.grandTotalMinor,
      amountDueMinor: totals.amountDueMinor,
      taxLines: totals.taxLines,
    };
  }, [lineItems, header.documentType]);

  const serverTotals = draft.serverInvoice?.totals ?? null;
  const totals = serverTotals ?? localTotals;

  const setField = <K extends keyof HeaderState>(key: K, value: HeaderState[K]) => {
    setHeader((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  const dirty = selectedClient !== null || rows.length > 0 || header.reference !== null;

  const handleCancel = () => {
    if (dirty) setConfirmCancel(true);
    else onCancel();
  };

  const handleSave = async () => {
    setFormError(null);
    const errors: Record<string, string> = {};
    if (!payload.clientId) errors.clientId = COPY.clientRequired;
    if (isScratch && !inlineConfig) errors.template = COPY.templateRequired;

    const parsed = invoiceInputSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        if (path && !path.startsWith('lineItems')) errors[path] = issue.message;
      }
      if (parsed.error.issues.some((i) => i.path[0] === 'lineItems')) setFormError(COPY.fixErrors);
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (!formError) setFormError(COPY.fixErrors);
      return;
    }

    try {
      const issued = await draft.finalize(payload);
      toast.success(COPY.issuedToast(issued.number ?? ''));
      onIssued(issued);
    } catch (err) {
      if (err instanceof HttpError && err.fields) {
        const mapped: Record<string, string> = {};
        for (const [k, msgs] of Object.entries(err.fields)) {
          if (msgs[0]) mapped[k] = msgs[0];
        }
        setFieldErrors(mapped);
        setFormError(COPY.fixErrors);
      } else {
        setFormError(toUserMessage(err) || COPY.finalizeFailed);
      }
    }
  };

  const saveStatus =
    draft.saveState === 'saving'
      ? COPY.saving
      : draft.saveState === 'error'
        ? COPY.saveError
        : draft.saveState === 'saved'
          ? COPY.saved
          : '';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {saveStatus}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={handleCancel}>
            {COPY.cancel}
          </Button>
          <Button type="button" onClick={() => void handleSave()} isLoading={draft.isFinalizing}>
            {COPY.save}
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
        fieldErrors={fieldErrors}
        payload={payload}
        totals={totals}
        syncing={draft.saveState === 'saving' || serverTotals === null}
        previewNumber={draft.serverInvoice?.number ?? undefined}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={COPY.discardTitle}
        description={COPY.discardBody}
        confirmLabel={COPY.discardConfirm}
        destructive
        onConfirm={onCancel}
      />
    </div>
  );
}
