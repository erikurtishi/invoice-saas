import { Resend } from 'resend';

import type { Mailer, MailMessage } from './mailer.js';

/**
 * The transactional transport (closes backlog 4.3.4 / L1.1.2; Decision A —
 * Resend, chosen for its permanent free tier, first-class attachment support and
 * an onboarding sandbox sending domain that works from localhost with no domain
 * of your own). Deliverability tuning on the real sending domain (SPF/DKIM/DMARC)
 * is V1.5.3.
 *
 * This is the only file that imports `resend`. Selected in `mail/index.ts` when
 * `RESEND_API_KEY` is set; otherwise `ConsoleMailer` stays the default for
 * `npm run dev` and CI. No call site changes — everything depends on `Mailer`.
 *
 * Failure contract (L1.1.4 / 4.3.7 / X.7.15): the Resend SDK reports errors in a
 * returned `{ error }` field rather than throwing, so we throw here. `sendInvoice`
 * (pdf-service.ts) turns any throw from `send()` into the "PDF generated but the
 * email could not be sent" 502 — never a combined success.
 */
export class ResendMailer implements Mailer {
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: MailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      attachments: (message.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });

    if (error) {
      throw new Error(`Resend rejected the message: ${error.name} — ${error.message}`);
    }
  }
}
