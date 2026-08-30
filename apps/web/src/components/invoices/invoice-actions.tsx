import type { InvoiceInput, InvoiceResponse, InvoiceSendResponse } from '@invoice-saas/shared';
import { AlertTriangle, CheckCircle2, Download, Mail } from 'lucide-react';
import { useRef, useState } from 'react';

import { useDownloadInvoicePdf, useSendInvoice } from '../../features/invoices/use-invoices';
import { useToast } from '../../hooks/use-toast';
import { toUserMessage } from '../../lib/error-message';
import { HttpError } from '../../lib/http-error';
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '../ui';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  download: 'Download',
  send: 'Send',
  resend: 'Send again',
  downloading: 'Preparing PDF…',
  sending: 'Sending…',
  slow: 'Still working — this is the app’s slowest step and can take a few seconds.',
  downloadedToast: 'PDF downloaded.',
  downloaded: 'Downloaded.',
  sentToast: (to: string) => `Invoice sent to ${to}.`,
  downloadFailed: "Couldn't generate the PDF. Try again.",
  sendFailed: "Couldn't send the invoice. Try again.",
  noEmailTooltip: 'This client has no email address. Add one to send, or download instead.',
  sentTitle: 'Sent',
  sentDetail: (to: string, at: string) => `Emailed to ${to} · ${at}`,
  emailFailedTitle: 'PDF ready, but the email didn’t send',
  downloadInstead: 'Download instead',
  tryAgain: 'Try again',
} as const;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

type SendError = { kind: 'email-failed' | 'generic'; message: string };

export interface InvoiceActionsProps {
  invoice: InvoiceResponse;
  /**
   * On the edit screen, the current unsaved form value — Download / Send then
   * render *these* edits without persisting (spec §6 / backlog 4.4.2). Omit on
   * the read-only detail screen to use the saved data.
   */
  draft?: InvoiceInput | null;
}

/**
 * The preview-screen actions (spec §6 — exactly Download and Send). Download is
 * always available; Send is disabled with a tooltip when the client has no email
 * (4.3.5). Both show a progress state and a "still working" note past ~3s (X.7.3),
 * a clear failure that never implies success (X.7.14), and Send has its own
 * confirmation state showing recipient + time (X.7.10) plus the "PDF made, email
 * failed → download instead" branch (X.7.15).
 */
export function InvoiceActions({ invoice, draft = null }: InvoiceActionsProps) {
  const toast = useToast();
  const download = useDownloadInvoicePdf();
  const send = useSendInvoice();

  const [downloadSlow, setDownloadSlow] = useState(false);
  const [sendSlow, setSendSlow] = useState(false);
  const [downloadedAt, setDownloadedAt] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [sent, setSent] = useState<InvoiceSendResponse | null>(null);
  const [sendError, setSendError] = useState<SendError | null>(null);
  const timers = useRef<{ d?: ReturnType<typeof setTimeout>; s?: ReturnType<typeof setTimeout> }>(
    {},
  );

  const canSend = Boolean(invoice.client.email);

  const runDownload = async () => {
    setDownloadError(null);
    setDownloadSlow(false);
    timers.current.d = setTimeout(() => setDownloadSlow(true), 3000);
    try {
      await download.mutateAsync({ id: invoice.id, draft });
      setDownloadedAt(Date.now());
      toast.success(COPY.downloadedToast);
    } catch (err) {
      setDownloadError(toUserMessage(err) || COPY.downloadFailed);
    } finally {
      clearTimeout(timers.current.d);
      setDownloadSlow(false);
    }
  };

  const runSend = async () => {
    setSendError(null);
    setSent(null);
    setSendSlow(false);
    timers.current.s = setTimeout(() => setSendSlow(true), 3000);
    try {
      const result = await send.mutateAsync({ id: invoice.id, draft });
      setSent(result);
      toast.success(COPY.sentToast(result.recipient));
    } catch (err) {
      if (err instanceof HttpError && err.status === 502) {
        setSendError({ kind: 'email-failed', message: err.message });
      } else {
        setSendError({ kind: 'generic', message: toUserMessage(err) || COPY.sendFailed });
      }
    } finally {
      clearTimeout(timers.current.s);
      setSendSlow(false);
    }
  };

  const sendButton = (
    <Button
      type="button"
      variant="outline"
      onClick={() => void runSend()}
      isLoading={send.isPending}
      disabled={!canSend || send.isPending}
    >
      <Mail className="size-4" aria-hidden />
      {sent ? COPY.resend : COPY.send}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void runDownload()}
          isLoading={download.isPending}
          disabled={download.isPending}
        >
          <Download className="size-4" aria-hidden />
          {COPY.download}
        </Button>

        {canSend ? (
          sendButton
        ) : (
          <Tooltip>
            {/* wrapper span — a disabled button doesn't fire the hover events Radix needs */}
            <TooltipTrigger asChild>
              <span tabIndex={0}>{sendButton}</span>
            </TooltipTrigger>
            <TooltipContent>{COPY.noEmailTooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {(download.isPending || send.isPending) && (downloadSlow || sendSlow) && (
        <p className="text-xs text-muted-foreground" role="status">
          {COPY.slow}
        </p>
      )}

      {download.isPending && (
        <p className="text-xs text-muted-foreground" role="status">
          {COPY.downloading}
        </p>
      )}
      {send.isPending && (
        <p className="text-xs text-muted-foreground" role="status">
          {COPY.sending}
        </p>
      )}

      {downloadedAt !== null && !download.isPending && !downloadError && (
        <p className="flex items-center gap-1.5 text-xs text-success" role="status">
          <CheckCircle2 className="size-3.5" aria-hidden />
          {COPY.downloaded}
        </p>
      )}

      {downloadError && (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="size-3.5" aria-hidden />
          {downloadError}
        </p>
      )}

      {sent && !send.isPending && (
        <div
          className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
          role="status"
        >
          <p className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="size-4" aria-hidden />
            {COPY.sentTitle}
          </p>
          <p className="mt-0.5 text-xs">
            {COPY.sentDetail(sent.recipient, formatWhen(sent.sentAt))}
          </p>
        </div>
      )}

      {sendError?.kind === 'email-failed' && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            {COPY.emailFailedTitle}
          </p>
          <p className="mt-0.5 text-xs">{sendError.message}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void runDownload()}>
              {COPY.downloadInstead}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => void runSend()}>
              {COPY.tryAgain}
            </Button>
          </div>
        </div>
      )}

      {sendError?.kind === 'generic' && (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="size-3.5" aria-hidden />
          {sendError.message}
        </p>
      )}
    </div>
  );
}
