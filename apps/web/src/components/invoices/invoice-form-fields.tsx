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
import { DOC_TYPE_LABELS, type HeaderState, PAPER_SIZES, SCRATCH } from './invoice-form-state';
import { LineItemsEditor } from './line-items-editor';
import { type LineRow } from './line-items';
import { TotalsPanel } from './totals-panel';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  docType: 'Document type',
  docTypeLocked: 'Locked — set when the invoice was issued.',
  client: 'Client',
  template: 'Template',
  scratch: 'Start from scratch…',
  editDesign: 'Edit design',
  templateName: 'New template name',
  templateNamePlaceholder: 'e.g. Studio invoice',
  inlineEditorTitle: 'Design a template for this invoice',
  done: 'Done',
  issueDate: 'Issue date',
  dueDate: 'Due date',
  validUntil: 'Valid until',
  currency: 'Currency',
  paperSize: 'Paper size',
  reference: 'Reference / PO number',
  creditNoteRef: 'Credit note for invoice',
  paidDate: 'Paid on',
  paymentMethod: 'Payment method',
  notes: 'Notes',
  footer: 'Footer text',
  signature: 'Signature label',
  currentTemplate: 'Current template',
} as const;

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
  const [designerOpen, setDesignerOpen] = useState(false);

  const fields = DOCUMENT_TYPE_FIELDS[header.documentType];
  const isScratch = templateChoice === SCRATCH;
  const aiBadge = (key: string) => (aiFilledFields?.has(key) ? <AiFilledBadge /> : undefined);

  // Include the invoice's own template as an option even if it's been deleted
  // from the library (X.7.22 — a historical invoice keeps its design).
  const inList = templates.some((t) => t.id === templateChoice);
  const templateOptions = [
    ...templates.map((t) => ({
      value: t.id,
      label: t.isDefault ? `${t.name} (default)` : t.name,
    })),
    ...(!inList && !isScratch ? [{ value: templateChoice, label: COPY.currentTemplate }] : []),
    { value: SCRATCH, label: COPY.scratch },
  ];

  const templateConfig: TemplateConfig | null = isScratch
    ? inlineConfig
    : (templates.find((t) => t.id === templateChoice)?.config ?? fallbackTemplateConfig ?? null);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={COPY.docType}
            required
            hint={lockDocumentType ? COPY.docTypeLocked : undefined}
          >
            {({ controlProps }) => (
              <Select
                {...controlProps}
                disabled={lockDocumentType}
                options={DOCUMENT_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABELS[t] }))}
                value={header.documentType}
                onValueChange={(v) => setField('documentType', v as DocumentType)}
              />
            )}
          </FormField>

          <FormField label={COPY.currency} required badge={aiBadge('currency')}>
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
          label={COPY.client}
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
          label={COPY.template}
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
                    aria-label={COPY.templateName}
                    placeholder={COPY.templateNamePlaceholder}
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
                    {COPY.editDesign}
                  </Button>
                </div>
              )}
            </div>
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={COPY.issueDate}
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
              label={fields.secondaryDate === 'validUntil' ? COPY.validUntil : COPY.dueDate}
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
            <FormField label={COPY.paidDate} error={fieldErrors.paidDate}>
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
            <FormField label={COPY.paymentMethod}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  value={header.paymentMethod ?? ''}
                  onChange={(e) => setField('paymentMethod', e.target.value || null)}
                />
              )}
            </FormField>
          )}

          <FormField label={COPY.paperSize} required>
            {({ controlProps }) => (
              <Select
                {...controlProps}
                options={PAPER_SIZES.map((p) => ({ value: p, label: p }))}
                value={header.paperSize}
                onValueChange={(v) => setField('paperSize', v as (typeof PAPER_SIZES)[number])}
              />
            )}
          </FormField>

          <FormField label={COPY.reference} badge={aiBadge('reference')}>
            {({ controlProps }) => (
              <Input
                {...controlProps}
                value={header.reference ?? ''}
                onChange={(e) => setField('reference', e.target.value || null)}
              />
            )}
          </FormField>

          {fields.showCreditNoteRef && (
            <FormField label={COPY.creditNoteRef} required error={fieldErrors.creditNoteRef}>
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
          <FormField label={COPY.notes} badge={aiBadge('notes')}>
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
            <FormField label={COPY.footer}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  value={header.footerText ?? ''}
                  onChange={(e) => setField('footerText', e.target.value || null)}
                />
              )}
            </FormField>
            <FormField label={COPY.signature}>
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
            <ModalTitle>{COPY.inlineEditorTitle}</ModalTitle>
          </ModalHeader>
          <div className="min-h-0 flex-1">
            <TemplateEditor config={inlineConfig} onChange={onInlineConfigChange} />
          </div>
          <div className="flex justify-end border-t border-border px-4 py-3">
            <Button type="button" onClick={() => setDesignerOpen(false)}>
              {COPY.done}
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
