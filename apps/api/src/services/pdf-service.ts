import {
  type InvoiceInput,
  invoicePdfFilename,
  invoiceResponseToRenderData,
  type InvoiceResponse,
  renderInvoice,
} from '@invoice-saas/shared';

import type { ScopedPrismaClient } from '../db/tenant-scope.js';
import { ApiError } from '../lib/api-error.js';
import { renderHtmlToPdf } from '../lib/pdf/browser-pool.js';
import { buildInvoiceEmail } from '../mail/invoice-email.js';
import { mailer } from '../mail/index.js';
import { buildPreviewResponse, getInvoice } from './invoice-service.js';

/**
 * Invoice delivery — PDF download (backlog 4.3.1 / 4.3.3) and email send (4.3.4).
 *
 * The PDF is always generated fresh from the current saved data — never cached,
 * never a frozen snapshot (spec §6). The HTML comes from the one shared
 * `renderInvoice` (the same function the live preview uses), in `print` media so
 * it carries `@page` sizing; Puppeteer turns it into a paginated PDF with the
 * self-hosted fonts embedded and text selectable.
 *
 * `assetBaseUrl` is a sentinel origin — `lib/pdf/browser-pool.ts` intercepts every
 * request and serves `/fonts/*` and `/uploads/*` from disk, aborting the rest, so
 * the render touches no real network.
 */

const ASSET_BASE_URL = 'http://invoice-pdf.local';

export interface InvoicePdf {
  filename: string;
  pdf: Buffer;
  invoice: InvoiceResponse;
}

/** Render an already-loaded invoice. Throws 409 for a draft (no number yet). */
export async function renderInvoicePdfFor(invoice: InvoiceResponse): Promise<InvoicePdf> {
  if (invoice.status !== 'ISSUED') {
    throw ApiError.conflict('Save this invoice before downloading it.');
  }

  const { html } = renderInvoice(invoice.templateConfig, invoiceResponseToRenderData(invoice), {
    media: 'print',
    assetBaseUrl: ASSET_BASE_URL,
  });

  const pdf = await renderHtmlToPdf(html);
  return { filename: invoicePdfFilename(invoice), pdf, invoice };
}

/**
 * Load the invoice to render: the saved row, or — when `draft` is given (4.4.2) —
 * the saved row with the caller's unsaved edits applied, keeping its number.
 */
async function resolveInvoice(
  db: ScopedPrismaClient,
  userId: string,
  id: string,
  draft: InvoiceInput | null,
): Promise<InvoiceResponse> {
  const saved = await getInvoice(db, id);
  return draft ? buildPreviewResponse(db, userId, saved, draft) : saved;
}

export async function renderInvoicePdf(
  db: ScopedPrismaClient,
  userId: string,
  id: string,
  draft: InvoiceInput | null = null,
): Promise<InvoicePdf> {
  return renderInvoicePdfFor(await resolveInvoice(db, userId, id, draft));
}

export interface InvoiceSendResult {
  recipient: string;
  sentAt: string;
  filename: string;
}

/**
 * Email the invoice PDF to the client's saved address (backlog 4.3.4, spec §91).
 * The covering email is localised to the invoice's language (4.3.6).
 *
 * Failure handling (4.3.7 / X.7.15): a missing client email is a 422 the UI turns
 * into a disabled Send button; a mailer failure is a 502 that explicitly says the
 * PDF was made but not sent, so the UI can offer Download as the fallback.
 */
export async function sendInvoice(
  db: ScopedPrismaClient,
  userId: string,
  id: string,
  draft: InvoiceInput | null = null,
): Promise<InvoiceSendResult> {
  const invoice = await resolveInvoice(db, userId, id, draft);
  if (invoice.status !== 'ISSUED') {
    throw ApiError.conflict('Save this invoice before sending it.');
  }
  if (!invoice.client.email) {
    throw ApiError.validation('This client has no email address on file.', {
      email: ['Add an email address to this client before sending.'],
    });
  }

  const { pdf, filename } = await renderInvoicePdfFor(invoice);

  const email = buildInvoiceEmail({
    language: invoice.language,
    documentType: invoice.documentType,
    number: invoice.number ?? '',
    businessName: invoice.business.name ?? '',
    clientName: invoice.client.name,
    totalMinor: invoice.totals.grandTotalMinor,
    currency: invoice.currency,
    dueDate: invoice.dueDate,
  });

  try {
    await mailer.send({
      to: invoice.client.email,
      ...email,
      attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
    });
  } catch {
    throw new ApiError(
      'INTERNAL_ERROR',
      'The PDF was generated but the email could not be sent. You can download it and send it yourself.',
      { status: 502 },
    );
  }

  return { recipient: invoice.client.email, sentAt: new Date().toISOString(), filename };
}
