import { verifyPassword } from '../lib/password.js';
import { prisma } from '../db/client.js';
import { ApiError } from '../lib/api-error.js';
import { cancelAllSubscriptions } from '../lib/billing/index.js';
import { storage } from '../lib/storage/index.js';

/**
 * Tenant self-service account operations (backlog X.4.4 / X.4.5) — the tenant
 * acting on their *own* account, distinct from the admin cross-tenant equivalents
 * in `admin-tenant-service.ts`. Both operate on the `users` row (decision D3 — the
 * user is the tenant) so they use the raw `prisma` client with an explicit id,
 * not `req.db`.
 */

const EXPORT_SCHEMA_VERSION = 1;

/** Re-authenticate the caller for a sensitive account action: the current
 * password must verify and the typed email must match (case-insensitively). */
export async function assertReauth(
  userId: string,
  input: { password: string; confirmEmail: string },
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  if (!user) throw ApiError.unauthorized();

  const passwordOk = await verifyPassword(input.password, user.passwordHash);
  if (!passwordOk) {
    throw ApiError.validation('That password is incorrect.', {
      password: ['That password is incorrect.'],
    });
  }
  if (input.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw ApiError.validation("That doesn't match your account email.", {
      confirmEmail: ["That doesn't match your account email."],
    });
  }
}

/**
 * Irreversibly delete the tenant and everything it owns (backlog X.4.4).
 *
 * Order matters: cancel billing at Stripe *first* and let a failure abort — a
 * caught error here means the row survives and the tenant can retry, which is far
 * better than deleting the account while a paid subscription keeps charging their
 * card with no way left to cancel it. Then remove the one stored asset (the logo;
 * PDFs are generated on demand, never persisted), then the single cascade delete
 * that wipes clients, products, templates, invoices + line items, history,
 * numbering, subscriptions, usage counters, AI logs and refresh/one-time tokens
 * (every child table is `onDelete: Cascade` from `users`). Support tickets are
 * `SetNull` and survive with just the email snapshot; `AdminAuditLog` is
 * unlinked and also survives.
 */
export async function deleteOwnAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, logoUrl: true },
  });
  if (!user) throw ApiError.unauthorized();

  try {
    await cancelAllSubscriptions(userId);
  } catch {
    throw new ApiError(
      'INTERNAL_ERROR',
      "Couldn't cancel your billing subscription just now, so your account was not deleted. Please try again in a few minutes.",
      { status: 502 },
    );
  }

  if (user.logoUrl) {
    const key = storage.keyFromUrl(user.logoUrl);
    if (key) await storage.delete(key).catch(() => undefined);
  }

  await prisma.user.delete({ where: { id: userId } });
}

/**
 * Everything the tenant has stored with us, as one JSON object (backlog X.4.5 —
 * data portability / "on request"). Soft-deleted rows are included: it is still
 * their data. `passwordHash` and the raw token tables are excluded; the logo is
 * referenced by URL (the binary isn't inlined). A tenant's dataset is bounded, so
 * this is a single synchronous read, not a job.
 */
export async function exportOwnData(userId: string): Promise<Record<string, unknown>> {
  const where = { tenantId: userId };

  const [
    user,
    clients,
    products,
    templates,
    invoices,
    numberSequences,
    numberingSettings,
    subscriptions,
    usageCounter,
    aiGenerationLogs,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.client.findMany({ where, orderBy: { createdAt: 'asc' } }),
    prisma.product.findMany({ where, orderBy: { createdAt: 'asc' } }),
    prisma.template.findMany({ where, orderBy: { createdAt: 'asc' } }),
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { lineItems: { orderBy: { position: 'asc' } }, historyEvents: true },
    }),
    prisma.invoiceNumberSequence.findMany({ where }),
    prisma.invoiceNumberingSetting.findMany({ where }),
    prisma.subscription.findMany({ where, orderBy: { createdAt: 'asc' } }),
    prisma.usageCounter.findUnique({ where: { tenantId: userId } }),
    prisma.aiGenerationLog.findMany({ where, orderBy: { createdAt: 'asc' } }),
  ]);

  if (!user) throw ApiError.unauthorized();

  const { passwordHash: _passwordHash, ...account } = user;

  return {
    meta: {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      note: 'A full copy of the data this account has stored. Generated invoice PDFs are not included — they are produced on demand from the invoice records here.',
    },
    account,
    clients,
    products,
    templates,
    invoices,
    invoiceNumbering: { sequences: numberSequences, settings: numberingSettings },
    subscriptions,
    usageCounter,
    aiGenerationLogs,
  };
}
