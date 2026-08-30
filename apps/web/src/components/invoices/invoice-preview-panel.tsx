import {
  type BusinessProfileResponse,
  type ClientResponse,
  computeInvoiceTotals,
  DOCUMENT_TYPE_FIELDS,
  type InvoiceInput,
  type InvoiceRenderData,
  type TemplateConfig,
} from '@invoice-saas/shared';
import { useMemo } from 'react';

import { InvoicePreview } from '../template/invoice-preview';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  noTemplate: 'Pick or design a template to see the preview.',
  draftNumber: 'DRAFT',
} as const;

function nonEmpty(...parts: Array<string | null | undefined>): string[] {
  return parts.map((p) => p?.trim()).filter((p): p is string => !!p);
}

function businessAddressLines(profile: BusinessProfileResponse): string[] {
  return nonEmpty(
    profile.addressLine1,
    profile.addressLine2,
    [profile.postalCode, profile.city].filter(Boolean).join(' ') || null,
    profile.country,
  );
}

function clientAddressLines(client: ClientResponse): string[] {
  if (client.addressMode === 'FREE_TEXT') {
    return (client.addressText ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }
  return nonEmpty(
    client.addressLine1,
    client.addressLine2,
    [client.postalCode, client.city].filter(Boolean).join(' ') || null,
    client.country,
  );
}

export interface InvoicePreviewPanelProps {
  value: InvoiceInput;
  profile: BusinessProfileResponse;
  selectedClient: ClientResponse | null;
  /** The resolved template config (saved template's, or the inline design). */
  templateConfig: TemplateConfig | null;
  /** The issued number once finalized; a placeholder while composing. */
  previewNumber?: string | undefined;
}

/**
 * Live invoice preview alongside the form (backlog 4.2.5) — the *same* render
 * engine as the eventual PDF (`InvoicePreview` → shared `renderInvoice`). Builds
 * an `InvoiceRenderData` from the current form value, the business profile and the
 * chosen client; totals come from the one shared calculator so on-screen figures
 * match the server (4.2.3). X.7.7: an invoice with no line items still renders a
 * clean page, not a broken table.
 */
export function InvoicePreviewPanel({
  value,
  profile,
  selectedClient,
  templateConfig,
  previewNumber,
}: InvoicePreviewPanelProps) {
  const data = useMemo<InvoiceRenderData>(() => {
    const fields = DOCUMENT_TYPE_FIELDS[value.documentType];
    const { lineItems, totals } = computeInvoiceTotals(
      value.lineItems.map((li) => ({
        description: li.description,
        quantityMilli: li.quantityMilli,
        unit: li.unit ?? null,
        unitPriceMinor: li.unitPriceMinor,
        taxRateBp: li.taxRateBp,
        discountBp: li.discountBp,
      })),
      { documentType: value.documentType },
    );

    return {
      documentType: value.documentType,
      language: value.language,
      currency: value.currency,
      number: previewNumber || COPY.draftNumber,
      issueDate: value.issueDate,
      dueDate: fields.secondaryDate === 'none' ? null : value.dueDate,
      paidDate: fields.showPaidDate ? value.paidDate : null,
      paymentMethod: fields.showPaymentMethod ? (value.paymentMethod ?? null) : null,
      creditNoteRef: fields.showCreditNoteRef ? (value.creditNoteRef ?? null) : null,
      reference: value.reference ?? null,
      business: {
        name: profile.businessName,
        addressLines: businessAddressLines(profile),
        email: null,
        phone: null,
        taxId: profile.taxId,
      },
      businessLogoUrl: profile.logoUrl,
      client: selectedClient
        ? {
            name: selectedClient.name,
            addressLines: clientAddressLines(selectedClient),
            email: selectedClient.email,
            phone: null,
            taxId: selectedClient.taxId,
          }
        : { name: '', addressLines: [], email: null, phone: null, taxId: null },
      lineItems,
      totals,
      notes: value.notes ?? null,
      bankDetails: null,
      footerText: value.footerText ?? null,
      signatureLabel: value.signatureLabel ?? null,
    };
  }, [value, profile, selectedClient, previewNumber]);

  if (!templateConfig) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        {COPY.noTemplate}
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden rounded-lg border border-border">
      <InvoicePreview config={templateConfig} data={data} paperSize={value.paperSize} zoom="fit" />
    </div>
  );
}
