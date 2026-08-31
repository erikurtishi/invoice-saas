import {
  type AiDraftResponse,
  type BusinessProfileResponse,
  type ClientResponse,
  computeInvoiceTotals,
  defaultTemplateConfig,
  type Entitlements,
  type InvoiceInput,
  invoiceInputSchema,
  type InvoiceResponse,
  type InvoiceTotalsResponse,
  type TemplateConfig,
  type TemplateResponse,
} from '@invoice-saas/shared';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchClient } from '../../features/clients/clients-api';
import { useInvoiceDraft } from '../../features/invoices/use-invoice-draft';
import { useToast } from '../../hooks/use-toast';
import { HttpError } from '../../lib/http-error';
import { toUserMessage } from '../../lib/error-message';
import { FormBanner } from '../form/form-banner';
import { Button, ConfirmDialog } from '../ui';
import { AiDraftPanel } from './ai-draft-panel';
import { InvoiceFormFields } from './invoice-form-fields';
import { type HeaderState, initialHeader, SCRATCH } from './invoice-form-state';
import { type LineRow, rowsFromAiDraft, rowsToLineItems } from './line-items';

export interface InvoiceFormProps {
  profile: BusinessProfileResponse;
  templates: TemplateResponse[];
  /** For the AI drafting panel's Premium gate + remaining counter (backlog 7.2).
   *  Undefined while entitlements load / fail — the panel then hides the counter
   *  and the server still enforces (7.1.6). */
  entitlements?: Entitlements | undefined;
  onIssued: (invoice: InvoiceResponse) => void;
  onCancel: () => void;
}

/**
 * The invoice *creation* flow (backlog Epic 4.2): compose-time autosave of a
 * DRAFT, then one explicit Save that finalizes it (number + ISSUED). The form
 * body is `<InvoiceFormFields>`, shared with the edit flow (Epic 4.4).
 */
export function InvoiceForm({
  profile,
  templates,
  entitlements,
  onIssued,
  onCancel,
}: InvoiceFormProps) {
  const { t } = useTranslation();
  const toast = useToast();

  const [header, setHeader] = useState<HeaderState>(() => initialHeader(profile));
  const [rows, setRows] = useState<LineRow[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientResponse | null>(null);
  /** Field keys an AI draft filled but the user hasn't touched yet (7.2.3). */
  const [aiFilled, setAiFilled] = useState<ReadonlySet<string>>(() => new Set());

  const defaultTemplateId =
    templates.find((tpl) => tpl.isDefault)?.id ?? templates[0]?.id ?? SCRATCH;
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

  /** Drop a field's "AI filled" marker once the user edits it (7.2.3). */
  const clearAiFilled = (key: string) => {
    setAiFilled((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const setField = <K extends keyof HeaderState>(key: K, value: HeaderState[K]) => {
    setHeader((prev) => ({ ...prev, [key]: value }));
    clearAiFilled(key);
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  const handleRowsChange = (next: LineRow[]) => {
    setRows(next);
    clearAiFilled('lineItems');
  };

  const handleClientChange = (client: ClientResponse | null) => {
    setSelectedClient(client);
    clearAiFilled('client');
  };

  /**
   * Map an AI draft into form state (backlog 7.2.2). Nothing is persisted — the
   * autosave effect picks up the change and the user still goes through Save
   * (7.2.3). `filledFields` drives the per-field "verify" badges.
   */
  const applyAiDraft = (result: AiDraftResponse) => {
    const d = result.draft;
    setHeader((prev) => ({
      ...prev,
      documentType: d.documentType,
      language: d.language,
      currency: d.currency,
      issueDate: d.issueDate,
      dueDate: d.dueDate,
      reference: d.reference,
      notes: d.notes,
    }));
    setRows(rowsFromAiDraft(d.lineItems));
    setFieldErrors({});
    setFormError(null);
    setAiFilled(new Set(result.filledFields));

    if (result.clientMatch.kind === 'matched') {
      const { clientId } = result.clientMatch;
      void fetchClient(clientId)
        .then((client) => {
          setSelectedClient(client);
          setHeader((prev) => ({ ...prev, clientId: client.id }));
        })
        .catch(() => {
          toast.error(t('invoices.aiMatchLoadFailed'));
          setAiFilled((prev) => {
            const next = new Set(prev);
            next.delete('client');
            return next;
          });
        });
    }
  };

  const dirty = selectedClient !== null || rows.length > 0 || header.reference !== null;

  const handleCancel = () => {
    if (dirty) setConfirmCancel(true);
    else onCancel();
  };

  const handleSave = async () => {
    setFormError(null);
    const errors: Record<string, string> = {};
    if (!payload.clientId) errors.clientId = t('invoices.clientRequired');
    if (isScratch && !inlineConfig) errors.template = t('invoices.templateRequired');

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
      const issued = await draft.finalize(payload);
      toast.success(t('invoices.issuedToast', { number: issued.number ?? '' }));
      onIssued(issued);
    } catch (err) {
      if (err instanceof HttpError && err.fields) {
        const mapped: Record<string, string> = {};
        for (const [k, msgs] of Object.entries(err.fields)) {
          if (msgs[0]) mapped[k] = msgs[0];
        }
        setFieldErrors(mapped);
        setFormError(t('invoices.fixErrors'));
      } else {
        setFormError(toUserMessage(err) || t('invoices.finalizeFailed'));
      }
    }
  };

  const saveStatus =
    draft.saveState === 'saving'
      ? t('invoices.saving')
      : draft.saveState === 'error'
        ? t('invoices.draftSaveError')
        : draft.saveState === 'saved'
          ? t('invoices.draftSaved')
          : '';

  return (
    <div className="flex flex-col gap-5">
      <AiDraftPanel
        canUseAi={entitlements?.canUseAi ?? false}
        ai={entitlements?.ai}
        onApply={applyAiDraft}
      />

      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {saveStatus}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSave()} isLoading={draft.isFinalizing}>
            {t('invoices.saveInvoice')}
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
        onRowsChange={handleRowsChange}
        selectedClient={selectedClient}
        onClientChange={handleClientChange}
        templateChoice={templateChoice}
        onTemplateChoiceChange={setTemplateChoice}
        inlineName={inlineName}
        onInlineNameChange={setInlineName}
        inlineConfig={inlineConfig}
        onInlineConfigChange={setInlineConfig}
        fieldErrors={fieldErrors}
        aiFilledFields={aiFilled}
        payload={payload}
        totals={totals}
        syncing={draft.saveState === 'saving' || serverTotals === null}
        previewNumber={draft.serverInvoice?.number ?? undefined}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t('invoices.createDiscardTitle')}
        description={t('invoices.createDiscardBody')}
        confirmLabel={t('invoices.discardConfirm')}
        destructive
        onConfirm={onCancel}
      />
    </div>
  );
}
