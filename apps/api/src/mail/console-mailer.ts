import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

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

    // Attachments (backlog 4.3.4) are written to a temp file so the generated PDF
    // is actually inspectable while developing without a provider account.
    const attachmentLines = (message.attachments ?? []).map((attachment) => {
      const path = join(tmpdir(), `mock-email-${Date.now()}-${attachment.filename}`);
      try {
        writeFileSync(path, attachment.content);
        return `Attachment: ${attachment.filename} (${attachment.contentType}, ${attachment.content.length} bytes) → ${path}`;
      } catch {
        return `Attachment: ${attachment.filename} (${attachment.contentType}, ${attachment.content.length} bytes)`;
      }
    });

    console.info(
      [
        '',
        line,
        `📧  MOCK EMAIL (ConsoleMailer — not actually sent)`,
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        ...attachmentLines,
        line,
        message.text,
        line,
        '',
      ].join('\n'),
    );
    return Promise.resolve();
  }
}
