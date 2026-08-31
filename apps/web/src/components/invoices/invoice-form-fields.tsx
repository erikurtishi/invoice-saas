import {
  type BusinessProfileResponse,
  type ClientResponse,
  DOCUMENT_TYPE_FIELDS,
  DOCUMENT_TYPES,
  type DocumentType,
  type InvoiceInput,
  type InvoiceTotalsResponse,
  PROFILE_CURRENCIES,
  type TemplateConfig,
  type TemplateResponse,
} from '@invoice-saas/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AiFilledBadge } from '../form/ai-filled-badge';
import { FormField } from '../form/field';
import { TemplateEditor } from '../template/template-editor';
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  Select,
  Textarea,
} from '../ui';
import { ClientPicker } from './client-picker';
import { InvoicePreviewPanel } from './invoice-preview-panel';
import { type HeaderState, PAPER_SIZES, SCRATCH } from './invoice-form-state';
import { LineItemsEditor } from './line-items-editor';
import { type LineRow } from './line-items';
import { TotalsPanel } from './totals-panel';

export interface InvoiceFormFieldsProps {
  profile: BusinessProfileResponse;
  templates: TemplateResponse[];

  header: HeaderState;
  setField: <K extends keyof HeaderState>(key: K, value: HeaderState[K]) => void;

  rows: LineRow[];
  onRowsChange: (rows: LineRow[]) => void;

  selectedClient: ClientResponse | null;
  onClientChange: (client: ClientResponse | null) => void;

  /** A template id, or `SCRATCH`. */
  templateChoice: string;
  onTemplateChoiceChange: (value: string) => void;
  inlineName: string;
  onInlineNameChange: (value: string) => void;
  inlineConfig: TemplateConfig;
  onInlineConfigChange: (config: TemplateConfig) => void;
  /** Design used when `templateChoice` points at a template not in the library
   * (e.g. the invoice's own, since deleted). */
  fallbackTemplateConfig?: TemplateConfig | undefined;

  /** Document type can't change after an invoice is issued (4.4.2). */
  lockDocumentType?: boolean;
  fieldErrors: Record<string, string>;
  /** Field keys an AI draft just populated (backlog 7.2.3) — each gets an "AI,
   *  verify" badge until the user edits it. `'lineItems'` marks the editor. */
  aiFilledFields?: ReadonlySet<string> | undefined;

  /** Assembled for the preview + totals; the parent owns how they're computed. */
  payload: InvoiceInput;
  totals: InvoiceTotalsResponse;
  syncing?: boolean;
  previewNumber?: string | undefined;
}

/**
 * The invoice form's body — every field, the line-item editor, the totals panel
 * and the live preview — shared by the create flow (Epic 4.2) and the edit flow
 * (Epic 4.4). State lives in the parent; this is presentation plus the field
 * wiring. `DOCUMENT_TYPE_FIELDS` decides which header fields show per type.
 */
export function InvoiceFormFields({
  profile,
  templates,
  header,
  setField,
  rows,
  onRowsChange,
  selectedClient,
  onClientChange,
  templateChoice,
  onTemplateChoiceChange,
  inlineName,
  onInlineNameChange,
  inlineConfig,
  onInlineConfigChange,
  fallbackTemplateConfig,
  lockDocumentType = false,
  fieldErrors,
  aiFilledFields,
  payload,
  totals,
  syncing,
  previewNumber,
}: InvoiceFormFieldsProps) {
  const { t } = useTranslation();
  const [designerOpen, setDesignerOpen] = useState(false);

  const fields = DOCUMENT_TYPE_FIELDS[header.documentType];
  const isScratch = templateChoice === SCRATCH;
  const aiBadge = (key: string) => (aiFilledFields?.has(key) ? <AiFilledBadge /> : undefined);

  // Include the invoice's own template as an option even if it's been deleted
  // from the library (X.7.22 — a historical invoice keeps its design).
  const inList = templates.some((tpl) => tpl.id === templateChoice);
  const templateOptions = [
    ...templates.map((tpl) => ({
      value: tpl.id,
      label: tpl.isDefault ? t('invoices.templateDefaultSuffix', { name: tpl.name }) : tpl.name,
    })),
    ...(!inList && !isScratch
      ? [{ value: templateChoice, label: t('invoices.currentTemplate') }]
      : []),
    { value: SCRATCH, label: t('invoices.templateScratch') },
  ];

  const templateConfig: TemplateConfig | null = isScratch
    ? inlineConfig
    : (templates.find((tpl) => tpl.id === templateChoice)?.config ??
      fallbackTemplateConfig ??
      null);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t('invoices.fieldDocType')}
            required
            hint={lockDocumentType ? t('invoices.fieldDocTypeLocked') : undefined}
          >
            {({ controlProps }) => (
              <Select
                {...controlProps}
                disabled={lockDocumentType}
                options={DOCUMENT_TYPES.map((dt) => ({ value: dt, label: t(`docTypes.${dt}`) }))}
                value={header.documentType}
                onValueChange={(v) => setField('documentType', v as DocumentType)}
              />
            )}
          </FormField>

          <FormField label={t('invoices.fieldCurrency')} required badge={aiBadge('currency')}>
            {({ controlProps }) => (
              <Select
                {...controlProps}
                options={PROFILE_CURRENCIES.map((c) => ({ value: c, label: c }))}
                value={header.currency}
                onValueChange={(v) => setField('currency', v)}
              />
            )}
          </FormField>
        </div>

        <FormField
          label={t('invoices.fieldClient')}
          required
          error={fieldErrors.clientId}
          badge={aiBadge('client')}
        >
          {({ controlProps, invalid }) => (
            <ClientPicker
              id={controlProps.id}
              aria-describedby={controlProps['aria-describedby']}
              invalid={invalid}
              value={header.clientId}
              selected={selectedClient}
              onChange={(client) => {
                onClientChange(client);
                setField('clientId', client?.id ?? null);
              }}
            />
          )}
        </FormField>

        <FormField
          label={t('invoices.fieldTemplate')}
          required
          error={fieldErrors.template ?? fieldErrors.templateId}
        >
          {({ controlProps }) => (
            <div className="flex flex-col gap-2">
              <Select
                {...controlProps}
                options={templateOptions}
                value={templateChoice}
                onValueChange={onTemplateChoiceChange}
              />
              {isScratch && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={t('invoices.templateNameLabel')}
                    placeholder={t('invoices.templateNamePlaceholder')}
                    className="max-w-xs"
                    value={inlineName}
                    onChange={(e) => onInlineNameChange(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDesignerOpen(true)}
                  >
                    {t('invoices.editDesign')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t('invoices.fieldIssueDate')}
            required
            error={fieldErrors.issueDate}
            badge={aiBadge('issueDate')}
          >
            {({ controlProps, invalid }) => (
              <Input
                {...controlProps}
                type="date"
                invalid={invalid}
                value={header.issueDate}
                onChange={(e) => setField('issueDate', e.target.value)}
              />
            )}
          </FormField>

          {fields.secondaryDate !== 'none' && (
            <FormField
              label={
                fields.secondaryDate === 'validUntil'
                  ? t('invoices.fieldValidUntil')
                  : t('invoices.fieldDueDate')
              }
              error={fieldErrors.dueDate}
              badge={aiBadge('dueDate')}
            >
              {({ controlProps, invalid }) => (
                <Input
                  {...controlProps}
                  type="date"
                  invalid={invalid}
                  value={header.dueDate ?? ''}
                  onChange={(e) => setField('dueDate', e.target.value || null)}
                />
              )}
            </FormField>
          )}

          {fields.showPaidDate && (
            <FormField label={t('invoices.fieldPaidDate')} error={fieldErrors.paidDate}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  type="date"
                  value={header.paidDate ?? ''}
                  onChange={(e) => setField('paidDate', e.target.value || null)}
                />
              )}
            </FormField>
          )}

          {fields.showPaymentMethod && (
            <FormField label={t('invoices.fieldPaymentMethod')}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  value={header.paymentMethod ?? ''}
                  onChange={(e) => setField('paymentMethod', e.target.value || null)}
                />
              )}
            </FormField>
          )}

          <FormField label={t('invoices.fieldPaperSize')} required>
            {({ controlProps }) => (
              <Select
                {...controlProps}
                options={PAPER_SIZES.map((p) => ({
                  value: p,
                  label:
                    p === 'LETTER'
                      ? t('profile.paperLetter')
                      : p === 'LEGAL'
                        ? t('profile.paperLegal')
                        : p,
                }))}
                value={header.paperSize}
                onValueChange={(v) => setField('paperSize', v as (typeof PAPER_SIZES)[number])}
              />
            )}
          </FormField>

          <FormField label={t('invoices.fieldReference')} badge={aiBadge('reference')}>
            {({ controlProps }) => (
              <Input
                {...controlProps}
                value={header.reference ?? ''}
                onChange={(e) => setField('reference', e.target.value || null)}
              />
            )}
          </FormField>

          {fields.showCreditNoteRef && (
            <FormField
              label={t('invoices.fieldCreditNoteRef')}
              required
              error={fieldErrors.creditNoteRef}
            >
              {({ controlProps, invalid }) => (
                <Input
                  {...controlProps}
                  invalid={invalid}
                  value={header.creditNoteRef ?? ''}
                  onChange={(e) => setField('creditNoteRef', e.target.value || null)}
                />
              )}
            </FormField>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {aiFilledFields?.has('lineItems') && (
            <span className="self-start">
              <AiFilledBadge />
            </span>
          )}
          <LineItemsEditor rows={rows} onChange={onRowsChange} currency={header.currency} />
        </div>

        <div className="grid gap-4">
          <FormField label={t('invoices.fieldNotes')} badge={aiBadge('notes')}>
            {({ controlProps }) => (
              <Textarea
                {...controlProps}
                rows={3}
                value={header.notes ?? ''}
                onChange={(e) => setField('notes', e.target.value || null)}
              />
            )}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('invoices.fieldFooter')}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  value={header.footerText ?? ''}
                  onChange={(e) => setField('footerText', e.target.value || null)}
                />
              )}
            </FormField>
            <FormField label={t('invoices.fieldSignature')}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  value={header.signatureLabel ?? ''}
                  onChange={(e) => setField('signatureLabel', e.target.value || null)}
                />
              )}
            </FormField>
          </div>
        </div>

        <TotalsPanel
          totals={totals}
          currency={header.currency}
          documentType={header.documentType}
          syncing={syncing ?? false}
        />
      </div>

      <div className="lg:sticky lg:top-4 lg:h-[calc(100dvh-6rem)]">
        <InvoicePreviewPanel
          value={payload}
          profile={profile}
          selectedClient={selectedClient}
          templateConfig={templateConfig}
          previewNumber={previewNumber}
        />
      </div>

      <Modal open={designerOpen} onOpenChange={setDesignerOpen}>
        <ModalContent className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden p-0">
          <ModalHeader className="border-b border-border px-4 py-3">
            <ModalTitle>{t('invoices.inlineEditorTitle')}</ModalTitle>
          </ModalHeader>
          <div className="min-h-0 flex-1">
            <TemplateEditor config={inlineConfig} onChange={onInlineConfigChange} />
          </div>
          <div className="flex justify-end border-t border-border px-4 py-3">
            <Button type="button" onClick={() => setDesignerOpen(false)}>
              {t('invoices.done')}
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
