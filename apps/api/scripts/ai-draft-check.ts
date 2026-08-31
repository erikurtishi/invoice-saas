/**
 * AI invoice-drafting check (backlog Epic 7.1). Drives the real
 * `services/ai-draft-service.ts` pipeline against a throwaway tenant with a
 * **fake** `AiDrafter` (7.1.1's concrete provider is deferred) and asserts:
 *
 *  - non-Premium is 403'd before any model call (7.1.6) — no log row
 *  - a valid extraction becomes an editable draft: raw amounts converted to
 *    integer minor units / bp by our code, never the model (7.1.3)
 *  - "due in 15 days" resolves to a real UTC date (7.1.5)
 *  - computed money the model bolts on (grandTotalMinor, lineTotalMinor) is
 *    ignored — never echoed in the response (guardrail 7.1.3)
 *  - fuzzy client match: "Acme" → the saved "Acme Trading LLC"; an unknown name
 *    comes back flagged `new` (7.1.4)
 *  - the monthly counter increments only on success (7.1.6); a provider failure
 *    and unusable output charge nothing (7.1.8)
 *  - every attempt writes exactly one `AiGenerationLog` row, successes and
 *    failures alike, with a sane `retries` count (7.1.7)
 *  - a spent monthly cap is 403'd with no new log row (decision D6)
 *  - the real `NullDrafter` default 503s and logs `provider_unconfigured`
 *  - `AiGenerationLog` rows are tenant-scoped
 *
 *   npm run ai:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';

import { aiDrafter } from '../src/lib/ai/index.js';
import { AiProviderError, type AiDrafter, type AiDraftRawResult } from '../src/lib/ai/drafter.js';
import { scopedPrisma } from '../src/db/tenant-scope.js';
import { createClient } from '../src/services/client-service.js';
import { generateInvoiceDraft } from '../src/services/ai-draft-service.js';

const prisma = new PrismaClient();
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}
async function statusOf(fn: () => Promise<unknown>): Promise<number | undefined> {
  try {
    await fn();
    return undefined;
  } catch (err) {
    return (err as { status?: number }).status;
  }
}

// --- a scripted fake drafter --------------------------------------------
type Step = (
  ctx: Parameters<AiDrafter['draft']>[0],
) => AiDraftRawResult | Promise<AiDraftRawResult>;

class FakeDrafter implements AiDrafter {
  readonly available = true;
  readonly model = 'fake-model';
  private steps: Step[];
  lastCtx: Parameters<AiDrafter['draft']>[0] | null = null;
  calls = 0;

  constructor(...steps: Step[]) {
    this.steps = steps;
  }
  draft(ctx: Parameters<AiDrafter['draft']>[0]): Promise<AiDraftRawResult> {
    this.calls += 1;
    this.lastCtx = ctx;
    const step = this.steps.shift();
    if (!step) return Promise.reject(new Error('FakeDrafter: no response queued'));
    return Promise.resolve(step(ctx));
  }
}

const raw = (extraction: unknown, input = 120, output = 60): AiDraftRawResult => ({
  extraction,
  model: 'fake-model',
  inputTokens: input,
  outputTokens: output,
});

/** A well-formed extraction for "Web design for Acme, 3 pages at 150 EUR each, due in 15 days". */
const acmeExtraction = {
  client: { name: 'Acme', email: null, address: null, taxId: null },
  lineItems: [
    {
      description: 'Web design — 3 pages',
      quantity: 3,
      unit: 'page',
      unitPriceAmount: 150,
      taxRatePercent: null,
    },
  ],
  issueDate: null,
  dueInDays: 15,
  dueDate: null,
  currency: 'EUR',
  reference: null,
  notes: null,
};

function addDaysUtc(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const today = new Date().toISOString().slice(0, 10);
const periodKey = today.slice(0, 7);

async function makeTenant(tier: 'FREE' | 'PREMIUM', label: string) {
  const user = await prisma.user.create({
    data: {
      email: `ai-check-${label}+${Date.now()}@example.test`,
      passwordHash: 'x',
      businessName: `AI Check ${label}`,
      defaultCurrency: 'EUR',
      uiLanguage: 'EN',
      invoiceLanguage: 'EN',
    },
  });
  if (tier === 'PREMIUM') {
    await prisma.subscription.create({
      data: {
        tenantId: user.id,
        tier: 'PREMIUM',
        source: 'MANUAL',
        status: 'ACTIVE',
        endDate: new Date(Date.now() + 90 * 864e5),
      },
    });
  }
  return user;
}

const premium = await makeTenant('PREMIUM', 'premium');
const free = await makeTenant('FREE', 'free');
const db = scopedPrisma(premium.id) as unknown as Parameters<typeof generateInvoiceDraft>[0];
const freeDb = scopedPrisma(free.id) as unknown as typeof db;

const logCount = (tenantId: string) => prisma.aiGenerationLog.count({ where: { tenantId } });
const aiUsed = async (tenantId: string) => {
  const row = await prisma.usageCounter.findUnique({ where: { tenantId } });
  return row && row.aiPeriodKey === periodKey ? row.aiGenerationsInPeriod : 0;
};

try {
  // --- non-Premium is blocked with no model call, no log ------------------
  {
    const before = await logCount(free.id);
    const drafter = new FakeDrafter(() => raw(acmeExtraction));
    const status = await statusOf(() =>
      generateInvoiceDraft(freeDb, free.id, { prompt: 'anything' }, drafter),
    );
    check('FREE tenant is 403d before drafting', status === 403, `status=${status}`);
    check('FREE tenant produced no model call', drafter.calls === 0);
    check('FREE tenant wrote no AiGenerationLog row', (await logCount(free.id)) === before);
  }

  // --- happy path: valid extraction → editable draft --------------------
  const acme = await createClient(db, {
    name: 'Acme Trading LLC',
    email: 'ap@acme.example',
    addressMode: 'STRUCTURED',
    addressLine1: '1 Trade St',
    city: 'Skopje',
    postalCode: '1000',
    country: 'MK',
    currency: null,
  });

  {
    const usedBefore = await aiUsed(premium.id);
    const logsBefore = await logCount(premium.id);
    const drafter = new FakeDrafter(() => raw(acmeExtraction));
    const res = await generateInvoiceDraft(
      db,
      premium.id,
      { prompt: 'Web design for Acme, 3 pages at 150 EUR each, due in 15 days.' },
      drafter,
    );

    check(
      'quantity 3 → quantityMilli 3000 (our conversion, not the model)',
      res.draft.lineItems[0]?.quantityMilli === 3000,
      String(res.draft.lineItems[0]?.quantityMilli),
    );
    check(
      '150 EUR → unitPriceMinor 15000',
      res.draft.lineItems[0]?.unitPriceMinor === 15000,
      String(res.draft.lineItems[0]?.unitPriceMinor),
    );
    check('discountBp is always 0', res.draft.lineItems[0]?.discountBp === 0);
    check(
      '"due in 15 days" → issue date + 15 (UTC)',
      res.draft.dueDate === addDaysUtc(today, 15),
      `${res.draft.dueDate} vs ${addDaysUtc(today, 15)}`,
    );
    check('issueDate defaulted to today (UTC)', res.draft.issueDate === today);
    check('currency taken from the prompt', res.draft.currency === 'EUR');
    check(
      'no totals anywhere in the response (guardrail 7.1.3)',
      !/grandTotalMinor|subtotalMinor|taxTotalMinor|lineTotalMinor|amountDueMinor/.test(
        JSON.stringify(res),
      ),
    );
    check(
      'fuzzy match: "Acme" → saved "Acme Trading LLC"',
      res.clientMatch.kind === 'matched' && res.clientMatch.clientId === acme.id,
      JSON.stringify(res.clientMatch),
    );
    check('draft.dueDate marked as an AI-filled field', res.filledFields.includes('dueDate'));
    check('counter incremented by exactly 1', (await aiUsed(premium.id)) === usedBefore + 1);
    check('res.ai.used reflects the new count', res.ai.used === usedBefore + 1);

    const logs = await prisma.aiGenerationLog.findMany({
      where: { tenantId: premium.id },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    check('one new AiGenerationLog row', (await logCount(premium.id)) === logsBefore + 1);
    check(
      'the row is SUCCESS, retries 0, cost 0 (unpriced fake model)',
      logs[0]?.status === 'SUCCESS' && logs[0]?.retries === 0 && logs[0]?.costMicros === 0,
      JSON.stringify({ s: logs[0]?.status, r: logs[0]?.retries, c: logs[0]?.costMicros }),
    );
  }

  // --- relative "net 30" with no issue date ----------------------------
  {
    const drafter = new FakeDrafter(() =>
      raw({ ...acmeExtraction, dueInDays: 30, currency: null }),
    );
    const res = await generateInvoiceDraft(db, premium.id, { prompt: 'net 30' }, drafter);
    check(
      'dueInDays 30 → today + 30 (UTC)',
      res.draft.dueDate === addDaysUtc(today, 30),
      String(res.draft.dueDate),
    );
    check(
      'currency falls back to the tenant default',
      res.draft.currency === 'EUR',
      res.draft.currency,
    );
  }

  // --- unknown client → flagged new ----------------------------------
  {
    const drafter = new FakeDrafter(() =>
      raw({
        ...acmeExtraction,
        client: {
          name: 'Zzz Logistics Kosovo',
          email: 'billing@zzz.example',
          address: 'Prishtina',
          taxId: null,
        },
      }),
    );
    const res = await generateInvoiceDraft(db, premium.id, { prompt: 'bill Zzz' }, drafter);
    check(
      'no confident match → clientMatch.kind === "new"',
      res.clientMatch.kind === 'new',
      JSON.stringify(res.clientMatch),
    );
    check(
      'suggested new client carries the extracted fields',
      res.clientMatch.kind === 'new' &&
        res.clientMatch.suggested.name === 'Zzz Logistics Kosovo' &&
        res.clientMatch.suggested.email === 'billing@zzz.example' &&
        res.clientMatch.suggested.addressMode === 'FREE_TEXT',
    );
  }

  // --- guardrail: model-supplied computed money is ignored -----------
  {
    const drafter = new FakeDrafter(() =>
      raw({
        ...acmeExtraction,
        grandTotalMinor: 99999,
        lineItems: [
          {
            description: 'Consulting',
            quantity: 2,
            unit: 'hour',
            unitPriceAmount: 45.5,
            taxRatePercent: 18,
            lineTotalMinor: 123456,
          },
        ],
      }),
    );
    const res = await generateInvoiceDraft(db, premium.id, { prompt: 'consulting' }, drafter);
    check(
      'unknown computed keys stripped, our numbers used',
      res.draft.lineItems[0]?.unitPriceMinor === 4550 &&
        res.draft.lineItems[0]?.taxRateBp === 1800 &&
        !JSON.stringify(res).includes('99999') &&
        !JSON.stringify(res).includes('123456'),
      JSON.stringify(res.draft.lineItems[0]),
    );
  }

  // --- retry once, then succeed -------------------------------------
  {
    const usedBefore = await aiUsed(premium.id);
    const drafter = new FakeDrafter(
      () => raw({ nope: true }),
      (ctx) => {
        check(
          'retry carried a repairHint',
          typeof ctx.repairHint === 'string' && ctx.repairHint.length > 0,
        );
        return raw(acmeExtraction);
      },
    );
    const res = await generateInvoiceDraft(db, premium.id, { prompt: 'retry me' }, drafter);
    check('two model calls (one retry)', drafter.calls === 2);
    check('retry path still succeeds + meters', (await aiUsed(premium.id)) === usedBefore + 1);
    check('res.draft has the recovered line item', res.draft.lineItems.length === 1);
    const logs = await prisma.aiGenerationLog.findMany({
      where: { tenantId: premium.id, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    check('the SUCCESS row records retries = 1', logs[0]?.retries === 1, String(logs[0]?.retries));
  }

  // --- provider throws → nothing charged --------------------------
  {
    const usedBefore = await aiUsed(premium.id);
    const logsBefore = await logCount(premium.id);
    const drafter = new FakeDrafter(() => {
      throw new AiProviderError('provider_timeout', 'upstream timed out');
    });
    const status = await statusOf(() =>
      generateInvoiceDraft(db, premium.id, { prompt: 'x' }, drafter),
    );
    check('provider failure surfaces as 503', status === 503, `status=${status}`);
    check('counter NOT incremented on provider failure', (await aiUsed(premium.id)) === usedBefore);
    const logs = await prisma.aiGenerationLog.findMany({
      where: { tenantId: premium.id },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    check('one PROVIDER_ERROR row written', (await logCount(premium.id)) === logsBefore + 1);
    check(
      'row is PROVIDER_ERROR with a reason',
      logs[0]?.status === 'PROVIDER_ERROR' && logs[0]?.errorReason === 'provider_timeout',
      JSON.stringify({ s: logs[0]?.status, e: logs[0]?.errorReason }),
    );
  }

  // --- malformed output twice → 502, nothing charged ------------
  {
    const usedBefore = await aiUsed(premium.id);
    const logsBefore = await logCount(premium.id);
    const drafter = new FakeDrafter(
      () => raw({ garbage: 1 }),
      () => raw({ still: 'bad' }),
    );
    const status = await statusOf(() =>
      generateInvoiceDraft(db, premium.id, { prompt: 'x' }, drafter),
    );
    check('two invalid replies → 502', status === 502, `status=${status}`);
    check('counter NOT incremented on invalid output', (await aiUsed(premium.id)) === usedBefore);
    const logs = await prisma.aiGenerationLog.findMany({
      where: { tenantId: premium.id },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    check('one INVALID_OUTPUT row (retries 1)', (await logCount(premium.id)) === logsBefore + 1);
    check(
      'row is INVALID_OUTPUT, retries 1',
      logs[0]?.status === 'INVALID_OUTPUT' && logs[0]?.retries === 1,
      JSON.stringify({ s: logs[0]?.status, r: logs[0]?.retries }),
    );
  }

  // --- spent monthly cap → 403, no model call, no log ----------
  {
    await prisma.usageCounter.upsert({
      where: { tenantId: premium.id },
      create: { tenantId: premium.id, aiGenerationsInPeriod: 50, aiPeriodKey: periodKey },
      update: { aiGenerationsInPeriod: 50, aiPeriodKey: periodKey },
    });
    const logsBefore = await logCount(premium.id);
    const drafter = new FakeDrafter(() => raw(acmeExtraction));
    const status = await statusOf(() =>
      generateInvoiceDraft(db, premium.id, { prompt: 'x' }, drafter),
    );
    check('cap reached → 403', status === 403, `status=${status}`);
    check('no model call once capped', drafter.calls === 0);
    check('no log row once capped', (await logCount(premium.id)) === logsBefore);
  }

  // --- the real NullDrafter default 503s + logs unconfigured -----
  {
    // give the tenant headroom again
    await prisma.usageCounter.update({
      where: { tenantId: premium.id },
      data: { aiGenerationsInPeriod: 0 },
    });
    const logsBefore = await logCount(premium.id);
    check('the shipped default drafter is unavailable', aiDrafter.available === false);
    const status = await statusOf(() =>
      generateInvoiceDraft(db, premium.id, { prompt: 'x' }, aiDrafter),
    );
    check('NullDrafter → 503', status === 503, `status=${status}`);
    const logs = await prisma.aiGenerationLog.findMany({
      where: { tenantId: premium.id },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    check(
      'logged provider_unconfigured, nothing charged',
      (await logCount(premium.id)) === logsBefore + 1 &&
        logs[0]?.errorReason === 'provider_unconfigured' &&
        (await aiUsed(premium.id)) === 0,
      JSON.stringify({ e: logs[0]?.errorReason }),
    );
  }

  // --- tenant scoping --------------------------------------------
  {
    const otherDb = scopedPrisma(free.id) as unknown as typeof db;
    const leaked = await otherDb.aiGenerationLog.findMany({ where: { tenantId: premium.id } });
    check("another tenant sees none of this tenant's AI logs", leaked.length === 0);
  }
} finally {
  await prisma.aiGenerationLog.deleteMany({ where: { tenantId: { in: [premium.id, free.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [premium.id, free.id] } } });
  await prisma.$disconnect();
}

console.log(failures === 0 ? '\nai-draft: all checks passed.' : `\nai-draft: ${failures} FAILED.`);
process.exit(failures === 0 ? 0 : 1);
