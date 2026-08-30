import type { Mailer, MailMessage } from './mailer.js';

/**
 * The dev/local transport (decision: pluggable Mailer, console transport, until a
 * provider is chosen). It prints the message — crucially the verification / reset
 * link — to the server console so the auth flows are fully exercisable end to end
 * on a laptop with no provider account.
 *
 * It is a deliberate error to reach production with this transport: `mail/index.ts`
 * throws at boot if `NODE_ENV=production` and nothing else was wired.
 */
export class ConsoleMailer implements Mailer {
  send(message: MailMessage): Promise<void> {
    const line = '─'.repeat(72);
    console.info(
      [
        '',
        line,
        `📧  MOCK EMAIL (ConsoleMailer — not actually sent)`,
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        line,
        message.text,
        line,
        '',
      ].join('\n'),
    );
    return Promise.resolve();
  }
}
