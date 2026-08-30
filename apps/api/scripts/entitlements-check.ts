/**
 * Entitlements / plan-enforcement check (backlog Epic 6.1). Drives the real
 * `lib/entitlements.ts` seam and `finalizeInvoice` against throwaway tenants and
 * asserts:
 *
 *  - a fresh account is FREE: 1 lifetime invoice, no AI, default template only
 *  - finalize increments the lifetime counter inside its transaction (6.1.3/6.1.5)
 *  - once spent, `requireCanCreateInvoice` 403s and a soft delete does NOT refund it
 *  - a manual BASIC grant lifts the limit and writes the `users.tier` cache (D14)
 *  - an overlapping PREMIUM grant wins (decision D5, "most access wins") + unlocks AI
 *  - a grant past its `endDate` is flipped to EXPIRED lazily and access drops to FREE
 *  - the monthly AI counter rolls over on a new calendar month (decision D6)
 *  - `Subscription` / `UsageCounter` rows are tenant-scoped
 *
 *   npm run entitlements:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';
import { defaultTemplateConfig } from '@invoice-saas/shared';

import { scopedPrisma } from '../src/db/tenant-scope.js';
import {
  recordAiGeneration,
  requireCanCreateInvoice,
  requireCanManageTemplates,
  requireCanUseAi,
  resolveEntitlements,
} from '../src/lib/entitlements.js';
import { createClient } from '../src/services/client-service.js';
import { createDraft, deleteInvoice, finalizeInvoice } from '../src/services/invoice-service.js';

const prisma = new PrismaClient();
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}
async function throws403(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err) {
    return (err as { status?: number }).status === 403;
  }
}

const tenant = await prisma.user.create({
  data: {
    email: `entitlements-check+${Date.now()}@example.test`,
    passwordHash: 'x',
    businessName: 'Entitlements Check Co',
    addressLine1: '1 Ledger Ln',
    city: 'Skopje',
    postalCode: '1000',
    country: 'MK',
  },
});
const db = scopedPrisma(tenant.id) as unknown as Parameters<typeof createDraft>[0];

async function makeIssuedInvoice() {
  const client = await createClient(db, {
    name: 'Ledger Client LLC',
    email: 'ap@ledger.example',
    addressMode: 'STRUCTURED',
    addressLine1: 'Rr. Test 2',
    city: 'Tirana',
    postalCode: '1001',
    country: 'AL',
    currency: null,
  });
  const input = {
    documentType: 'INVOICE' as const,
    language: 'EN' as const,
    currency: 'EUR',
    paperSize: 'A4' as const,
    clientId: client.id,
    templateId: null,
    newTemplate: { name: 'Print', config: defaultTemplateConfig() },
    issueDate: '2026-08-30',
    dueDate: '2026-09-13',
    paidDate: null,
    paymentMethod: null,
    creditNoteRef: null,
    creditNoteOfId: null,
    reference: 'PO-1',
    notes: null,
    footerText: null,
    signatureLabel: null,
    lineItems: [
      {
        productId: null,
        description: 'Consulting',
        quantityMilli: 1000,
        unit: 'hour',
        unitPriceMinor: 8000,
        taxRateBp: 1800,
        discountBp: 0,
      },
    ],
  };
  const draft = await createDraft(db, tenant.id, input);
  return finalizeInvoice(db, tenant.id, tenant.id, draft.id, {
    ...input,
    newTemplate: { name: 'Print', config: defaultTemplateConfig() },
  });
}

async function addGrant(tier: 'BASIC' | 'PREMIUM', endDate: Date) {
  return prisma.subscription.create({
    data: { tenantId: tenant.id, tier, source: 'MANUAL', status: 'ACTIVE', endDate },
  });
}

const future = new Date(Date.now() + 90 * 864e5);
const past = new Date(Date.now() - 864e5);

try {
  // --- fresh account is FREE -------------------------------------------------
  const free = await resolveEntitlements(tenant.id);
  check(
    'fresh account resolves to FREE with a 1-invoice lifetime allowance',
    free.tier === 'FREE' &&
      free.invoices.unlimited === false &&
      free.invoices.limit === 1 &&
      free.invoices.used === 0 &&
      free.invoices.remaining === 1,
    JSON.stringify(free.invoices),
  );
  check('FREE cannot use AI', free.canUseAi === false && free.ai.unlimited === false);
  check('FREE cannot manage templates', free.canManageTemplates === false);
  check(
    'FREE may create its first invoice',
    !(await throws403(() => requireCanCreateInvoice(tenant.id))),
  );
  check(
    'FREE is blocked from the template editor',
    await throws403(() => requireCanManageTemplates(tenant.id)),
  );

  // --- finalize spends the lifetime invoice -------------------------------
  const invoice = await makeIssuedInvoice();
  const afterFinalize = await resolveEntitlements(tenant.id);
  check(
    'finalize increments the lifetime counter (6.1.3)',
    afterFinalize.invoices.used === 1 && afterFinalize.invoices.remaining === 0,
    JSON.stringify(afterFinalize.invoices),
  );
  check(
    'spent FREE account is 403d on a second invoice',
    await throws403(() => requireCanCreateInvoice(tenant.id)),
  );

  // --- soft delete does not refund the slot ------------------------------
  await deleteInvoice(db, invoice.id);
  const afterDelete = await resolveEntitlements(tenant.id);
  check(
    'soft-deleting the invoice does NOT give the slot back (6.1.5)',
    afterDelete.invoices.used === 1 && afterDelete.invoices.remaining === 0,
  );
  check('still 403 after the delete', await throws403(() => requireCanCreateInvoice(tenant.id)));

  // --- manual BASIC grant lifts the limit + writes the tier cache -------
  const basic = await addGrant('BASIC', future);
  const onBasic = await resolveEntitlements(tenant.id);
  check(
    'manual BASIC grant → tier BASIC, unlimited invoices, source/expiry surfaced',
    onBasic.tier === 'BASIC' &&
      onBasic.invoices.unlimited === true &&
      onBasic.invoices.remaining === null &&
      onBasic.source === 'manual' &&
      onBasic.accessEndsAt === future.toISOString(),
    JSON.stringify({ tier: onBasic.tier, source: onBasic.source }),
  );
  const cached = await prisma.user.findUnique({ where: { id: tenant.id }, select: { tier: true } });
  check('users.tier cache was written to BASIC (D14)', cached?.tier === 'BASIC');
  check(
    'BASIC may create invoices again',
    !(await throws403(() => requireCanCreateInvoice(tenant.id))),
  );
  check(
    'BASIC may manage templates',
    !(await throws403(() => requireCanManageTemplates(tenant.id))),
  );
  check('BASIC still cannot use AI', await throws403(() => requireCanUseAi(tenant.id)));

  // --- overlapping PREMIUM grant wins (D5) -----------------------------
  const premium = await addGrant('PREMIUM', future);
  const onPremium = await resolveEntitlements(tenant.id);
  check(
    'overlapping PREMIUM grant wins over BASIC (decision D5)',
    onPremium.tier === 'PREMIUM' &&
      onPremium.canUseAi === true &&
      onPremium.ai.unlimited === false &&
      onPremium.ai.limit === 50 &&
      onPremium.ai.remaining === 50 &&
      typeof onPremium.ai.periodResetsAt === 'string',
    JSON.stringify(onPremium.ai),
  );
  check('PREMIUM may use AI', !(await throws403(() => requireCanUseAi(tenant.id))));

  // --- AI counter increments + rolls over on a new month ---------------
  await recordAiGeneration(tenant.id);
  await recordAiGeneration(tenant.id);
  const aiUsed = await resolveEntitlements(tenant.id);
  check('AI generations counted this month', aiUsed.ai.used === 2 && aiUsed.ai.remaining === 48);
  const nextMonth = new Date();
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const rolled = await resolveEntitlements(tenant.id, nextMonth);
  check('AI counter reads 0 in the next calendar month (decision D6)', rolled.ai.used === 0);

  // --- expiry: grant past its endDate is flipped to EXPIRED lazily ----
  await prisma.subscription.updateMany({
    where: { id: { in: [basic.id, premium.id] } },
    data: { endDate: past },
  });
  const expired = await resolveEntitlements(tenant.id);
  check('access drops back to FREE once every grant has expired (6.3.3)', expired.tier === 'FREE');
  const rows = await prisma.subscription.findMany({ where: { tenantId: tenant.id } });
  check(
    'the expired grants were flipped to EXPIRED in the table',
    rows.length === 2 && rows.every((r) => r.status === 'EXPIRED'),
    rows.map((r) => r.status).join(','),
  );
  const cacheBack = await prisma.user.findUnique({
    where: { id: tenant.id },
    select: { tier: true },
  });
  check('users.tier cache reverted to FREE', cacheBack?.tier === 'FREE');

  // --- tenant scoping ------------------------------------------------
  const other = await prisma.user.create({
    data: {
      email: `entitlements-check-2+${Date.now()}@example.test`,
      passwordHash: 'x',
      businessName: 'Other Co',
    },
  });
  const otherDb = scopedPrisma(other.id) as unknown as typeof db;
  const leakedSubs = await otherDb.subscription.findMany({ where: { tenantId: tenant.id } });
  const leakedUsage = await otherDb.usageCounter.findMany({ where: { tenantId: tenant.id } });
  check(
    "another tenant sees none of this tenant's billing rows",
    leakedSubs.length === 0 && leakedUsage.length === 0,
  );
  await prisma.user.delete({ where: { id: other.id } });
} finally {
  await prisma.user.delete({ where: { id: tenant.id } });
  await prisma.$disconnect();
}

console.log(
  failures === 0 ? '\nentitlements: all checks passed.' : `\nentitlements: ${failures} FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
