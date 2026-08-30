/**
 * The mail port (backlog 1.1.2 / 1.1.3). Everything that sends email depends on
 * this interface, never on a concrete provider. The transactional provider
 * (Resend / Postmark / SMTP) is still an open decision in docs/decisions.md — when
 * it lands it is a single new `Mailer` implementation and a one-line swap in
 * `mail/index.ts`, with zero changes at any call site.
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Always provided. */
  text: string;
  /** Optional HTML body; providers fall back to `text` when absent. */
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
