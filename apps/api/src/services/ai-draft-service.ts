import type { Prisma } from '@prisma/client';
import type { ZodError } from 'zod';
import {
  AI_CLIENT_MATCH_THRESHOLD,
  aiExtractionSchema,
  INVOICE_QUANTITY_MILLI_MAX,
  INVOICE_TAX_RATE_BP_MAX,
  INVOICE_UNIT_PRICE_MINOR_MAX,
  type AiClientMatch,
  type AiDraftLineItem,
  type AiDraftRequest,
  type AiDraftResponse,
  type AiExtraction,
  type AiGenerationStatus,
  type AiInvoiceDraft,
} from '@invoice-saas/shared';

import { prisma } from '../db/client.js';
import type { ScopedPrismaClient } from '../db/tenant-scope.js';
import { ApiError } from '../lib/api-error.js';
import { aiDrafter, AiProviderError, estimateCostMicros, type AiDrafter } from '../lib/ai/index.js';
import { bestNameMatch } from '../lib/ai/fuzzy.js';
import { recordAiGeneration, requireCanUseAi, resolveEntitlements } from '../lib/entitlements.js';

/**
 * AI invoice drafting (backlog Epic 7.1, spec §8). Turns one plain-language
 * sentence into an editable invoice draft — nothing is saved or sent (that stays
 * the normal form → preview → save flow).
 *
 * This module owns everything that is *not* the raw LLM call: the Premium /
 * monthly-cap gate (7.1.6, via the existing entitlement guards), model-output
 * validation with a single retry (7.1.2), the guardrails (7.1.3 — the model
 * returns raw stated numbers, we compute every derived amount; blank beats a
 * guess), relative-date resolution in UTC (7.1.5), fuzzy client matching (7.1.4),
 * usage metering (7.1.6) and cost logging (7.1.7). The provider itself is behind
 * the `AiDrafter` port (`lib/ai/`), still a `NullDrafter` until 7.1.1 picks one —
 * so this is fully exercised by `ai:check` with a fake drafter.
 *
 * Metering rule (7.1.6 / decision D6): `recordAiGeneration` runs **only** on a
 * fully successful, schema-valid generation. A provider failure or unusable
 * output charges nothing. Either way exactly one `AiGenerationLog` row is written
 * for cost monitoring (7.1.7) — a request the cap already rejected never reaches
 * here.
 */

// --- date helpers: everything is UTC (7.1.5 decision — no tenant timezone) ---

/** Today as `YYYY-MM-DD`, UTC. */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `('2026-08-31', 15)` → `'2026-09-15'`, UTC calendar arithmetic. */
function addDaysUtc(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

// --- model call + validation + one retry (7.1.2) --------------------------

function summariseIssues(error: ZodError): string {
  return error.issues
    .slice(0, 6)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

function providerErrorStatus(err: unknown): AiGenerationStatus {
  return err instanceof AiProviderError && err.rateLimited ? 'RATE_LIMITED' : 'PROVIDER_ERROR';
}

function providerErrorReason(err: unknown): string {
  return err instanceof AiProviderError ? err.reason : 'provider_error';
}

/** Provider failures (incl. the unconfigured `NullDrafter`) become a 503 — the
 *  monthly allowance is explicitly untouched (7.1.8). Anything that isn't an
 *  `AiProviderError` is unexpected and propagates as-is. */
function friendlyProviderError(err: unknown): unknown {
  if (!(err instanceof AiProviderError)) return err;
  return new ApiError(
    'INTERNAL_ERROR',
    err.rateLimited
      ? 'The AI service is busy right now — please try again shortly. Your monthly allowance was not affected.'
      : 'AI drafting is temporarily unavailable. Your monthly allowance was not affected.',
    { status: 503 },
  );
}

interface LogFields {
  model: string;
  status: AiGenerationStatus;
  promptChars: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  retries: number;
  errorReason: string | null;
}

/** One row per attempt (7.1.7). Best-effort: a failed write must never fail the
 *  generation or mask a provider error. Unscoped client + explicit `tenantId`,
 *  like the rest of the usage seam. */
async function logAttempt(tenantId: string, fields: LogFields): Promise<void> {
  try {
    await prisma.aiGenerationLog.create({
      data: { tenantId, ...fields } satisfies Prisma.AiGenerationLogUncheckedCreateInput,
    });
  } catch (err) {
    console.error('[ai-draft] failed to write AiGenerationLog', err);
  }
}

interface ExtractionOutcome {
  extraction: AiExtraction;
  model: string;
  inputTokens: number;
  outputTokens: number;
  retries: number;
}

/**
 * Calls the drafter, validates against `aiExtractionSchema`, retries once with a
 * repair hint on failure. Writes the failure log rows itself; on success it
 * returns the token totals for the caller to log alongside the metering bump.
 */
async function extractWithRetry(
  drafter: AiDrafter,
  ctx: Parameters<AiDrafter['draft']>[0],
  tenantId: string,
  promptChars: number,
): Promise<ExtractionOutcome> {
  let first;
  try {
    first = await drafter.draft(ctx);
  } catch (err) {
    await logAttempt(tenantId, {
      model: drafter.model,
      status: providerErrorStatus(err),
      promptChars,
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
      retries: 0,
      errorReason: providerErrorReason(err),
    });
    throw friendlyProviderError(err);
  }

  const firstParse = aiExtractionSchema.safeParse(first.extraction);
  if (firstParse.success) {
    return {
      extraction: firstParse.data,
      model: first.model,
      inputTokens: first.inputTokens,
      outputTokens: first.outputTokens,
      retries: 0,
    };
  }

  // Retry once (7.1.2) with a description of what was wrong.
  let second;
  try {
    second = await drafter.draft({ ...ctx, repairHint: summariseIssues(firstParse.error) });
  } catch (err) {
    await logAttempt(tenantId, {
      model: drafter.model,
      status: providerErrorStatus(err),
      promptChars,
      inputTokens: first.inputTokens,
      outputTokens: first.outputTokens,
      costMicros: estimateCostMicros(first.model, first.inputTokens, first.outputTokens),
      retries: 1,
      errorReason: providerErrorReason(err),
    });
    throw friendlyProviderError(err);
  }

  const inputTokens = first.inputTokens + second.inputTokens;
  const outputTokens = first.outputTokens + second.outputTokens;
  const secondParse = aiExtractionSchema.safeParse(second.extraction);
  if (!secondParse.success) {
    await logAttempt(tenantId, {
      model: second.model,
      status: 'INVALID_OUTPUT',
      promptChars,
      inputTokens,
      outputTokens,
      costMicros: estimateCostMicros(second.model, inputTokens, outputTokens),
      retries: 1,
      errorReason: 'schema_invalid',
    });
    throw new ApiError(
      'INTERNAL_ERROR',
      'The AI could not produce a usable draft from that description. Try rephrasing it. Your monthly allowance was not affected.',
      { status: 502 },
    );
  }

  return {
    extraction: secondParse.data,
    model: second.model,
    inputTokens,
    outputTokens,
    retries: 1,
  };
}

// --- extraction → editable draft (guardrails live here, 7.1.3) -----------

interface KnownClient {
  id: string;
  name: string;
  email: string | null;
  taxId: string | null;
}

interface BuiltDraft {
  draft: AiInvoiceDraft;
  clientMatch: AiClientMatch;
  filledFields: string[];
  uncertainFields: string[];
  warnings: string[];
}

function matchClient(extracted: AiExtraction['client'], clients: KnownClient[]): AiClientMatch {
  const name = extracted.name?.trim();
  if (!name) return { kind: 'none' };

  const best = bestNameMatch(
    name,
    clients.map((c) => c.name),
  );
  const hit = best ? clients[best.index] : undefined;
  if (best && hit && best.score >= AI_CLIENT_MATCH_THRESHOLD) {
    return {
      kind: 'matched',
      clientId: hit.id,
      name: hit.name,
      confidence: Math.round(best.score * 100) / 100,
    };
  }

  // No confident match → flag as new (7.1.4), prefilled from what was extracted.
  return {
    kind: 'new',
    suggested: {
      name,
      email: extracted.email,
      taxId: extracted.taxId,
      addressMode: 'FREE_TEXT',
      addressText: extracted.address,
    },
  };
}

function buildDraft(
  extraction: AiExtraction,
  ctx: { today: string; defaultCurrency: string; language: AiInvoiceDraft['language'] },
  clients: KnownClient[],
): BuiltDraft {
  const filledFields = new Set<string>();
  const uncertainFields = new Set<string>();
  const warnings: string[] = [];

  // --- currency + dates ---
  const currency = extraction.currency ?? ctx.defaultCurrency;
  if (extraction.currency) filledFields.add('currency');

  const issueDate = extraction.issueDate ?? ctx.today;
  if (extraction.issueDate) filledFields.add('issueDate');

  let dueDate: string | null = null;
  if (extraction.dueDate) {
    dueDate = extraction.dueDate;
    filledFields.add('dueDate');
  } else if (extraction.dueInDays !== null) {
    dueDate = addDaysUtc(issueDate, extraction.dueInDays);
    filledFields.add('dueDate');
  } else {
    uncertainFields.add('dueDate');
    warnings.push('No payment due date was mentioned — set one if this invoice needs one.');
  }

  // --- line items: raw stated numbers → integer minor units / bp (7.1.3) ---
  const lineItems: AiDraftLineItem[] = extraction.lineItems.map((li, index) => {
    let quantityMilli: number;
    if (li.quantity !== null) {
      quantityMilli = clampInt(li.quantity * 1000, 1, INVOICE_QUANTITY_MILLI_MAX);
    } else {
      quantityMilli = 1000;
      uncertainFields.add(`lineItems.${index}.quantity`);
    }

    let unitPriceMinor: number;
    if (li.unitPriceAmount !== null) {
      unitPriceMinor = clampInt(li.unitPriceAmount * 100, 0, INVOICE_UNIT_PRICE_MINOR_MAX);
    } else {
      unitPriceMinor = 0;
      uncertainFields.add(`lineItems.${index}.unitPrice`);
    }

    const taxRateBp =
      li.taxRatePercent !== null
        ? clampInt(li.taxRatePercent * 100, 0, INVOICE_TAX_RATE_BP_MAX)
        : 0;

    return {
      description: li.description,
      quantityMilli,
      unit: li.unit,
      unitPriceMinor,
      taxRateBp,
      discountBp: 0 as const,
    };
  });

  if (lineItems.length === 0) {
    uncertainFields.add('lineItems');
    warnings.push('Could not identify any line items — add them manually.');
  } else {
    filledFields.add('lineItems');
    if (uncertainFields.has('lineItems') === false) {
      const anyMissingPrice = lineItems.some((li) => li.unitPriceMinor === 0);
      if (anyMissingPrice) {
        warnings.push('Some line items have no price — fill them in before saving.');
      }
    }
  }

  // --- text passthrough ---
  const reference = extraction.reference;
  if (reference) filledFields.add('reference');
  const notes = extraction.notes;
  if (notes) filledFields.add('notes');

  // --- client ---
  const clientMatch = matchClient(extraction.client, clients);
  if (clientMatch.kind === 'matched') {
    filledFields.add('client');
  } else if (clientMatch.kind === 'new') {
    // Not marked "filled" — nothing is selected; the user must add this client.
    uncertainFields.add('client');
    warnings.push(
      `"${clientMatch.suggested.name}" isn't a saved client yet — add them, then pick them.`,
    );
  } else {
    uncertainFields.add('client');
    warnings.push('No client was named — pick or add one.');
  }

  const draft: AiInvoiceDraft = {
    documentType: 'INVOICE',
    language: ctx.language,
    currency,
    issueDate,
    dueDate,
    reference,
    notes,
    lineItems,
  };

  return {
    draft,
    clientMatch,
    filledFields: [...filledFields],
    uncertainFields: [...uncertainFields],
    warnings,
  };
}

// --- public entry point -------------------------------------------------

/**
 * `POST /ai/draft-invoice` (backlog 7.1). `db` is the tenant-scoped client (for
 * the client lookup); `drafter` is injectable so `ai:check` can drive the whole
 * pipeline with a fake provider.
 */
export async function generateInvoiceDraft(
  db: ScopedPrismaClient,
  userId: string,
  input: AiDraftRequest,
  drafter: AiDrafter = aiDrafter,
): Promise<AiDraftResponse> {
  // Premium + this month's cap still available (7.1.6). Throws 403 otherwise —
  // no model call, no log row.
  await requireCanUseAi(userId);

  const [user, clientRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { defaultCurrency: true, invoiceLanguage: true },
    }),
    db.client.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, email: true, taxId: true },
    }),
  ]);
  if (!user) throw ApiError.unauthorized();

  const today = utcToday();
  const promptChars = input.prompt.length;

  const outcome = await extractWithRetry(
    drafter,
    {
      prompt: input.prompt,
      today,
      defaultCurrency: user.defaultCurrency,
      knownClientNames: clientRows.map((c) => c.name),
    },
    userId,
    promptChars,
  );

  const built = buildDraft(
    outcome.extraction,
    { today, defaultCurrency: user.defaultCurrency, language: user.invoiceLanguage },
    clientRows,
  );

  // Success — meter first (7.1.6), then log the cost (7.1.7).
  await recordAiGeneration(userId);
  await logAttempt(userId, {
    model: outcome.model,
    status: 'SUCCESS',
    promptChars,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    costMicros: estimateCostMicros(outcome.model, outcome.inputTokens, outcome.outputTokens),
    retries: outcome.retries,
    errorReason: null,
  });

  const entitlements = await resolveEntitlements(userId);

  return {
    ...built,
    ai: {
      used: entitlements.ai.used,
      limit: entitlements.ai.limit,
      remaining: entitlements.ai.remaining,
      periodResetsAt: entitlements.ai.periodResetsAt,
    },
  };
}
