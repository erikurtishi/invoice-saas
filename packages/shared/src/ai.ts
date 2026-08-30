import { z } from 'zod';

import { DOCUMENT_TYPES } from './render/invoice-data.js';
import { PROFILE_LANGUAGES } from './profile.js';
import {
  INVOICE_LINE_ITEMS_MAX,
  INVOICE_QUANTITY_MILLI_MAX,
  INVOICE_TAX_RATE_BP_MAX,
  INVOICE_UNIT_PRICE_MINOR_MAX,
} from './invoice.js';

/**
 * AI invoice-drafting shapes (spec §8, backlog Epic 7.1). Imported by `apps/api`
 * for the `/ai/draft-invoice` request/response contract and the model-output
 * validator, and by `apps/web` (Epic 7.2) for the AI input box and the
 * populate-the-form step.
 *
 * Three layers live here:
 *  1. `aiDraftRequestSchema`      — what the tenant types (one sentence).
 *  2. `aiExtractionSchema`        — the STRICT structured output the model must
 *     return (7.1.1 / 7.1.2). Deliberately carries **no** computed money: no
 *     subtotal, no tax total, no grand total, no line totals. The model returns
 *     raw stated numbers only; `apps/api` calculates every derived amount with
 *     the one shared calculator (`computeInvoiceTotals`) — guardrail 7.1.3.
 *  3. `aiDraftResponseSchema`     — the editable draft the API hands back, shaped
 *     to drop straight into the invoice form. Still no totals — the form and
 *     `POST /invoices/calculate` own those.
 *
 * Dates: the model never invents a calendar date from a relative phrase. It
 * returns `dueInDays` (an integer offset) and the API resolves it against
 * **today in UTC** (7.1.5 decision — there is no per-tenant timezone column yet;
 * revisit when one exists). An explicitly dated "due 5 March" comes back as
 * `dueDate`.
 *
 * Money: the model returns human amounts (`unitPriceAmount: 150.5`), not minor
 * units — converting "€150" to `15000` is arithmetic, so the API does it
 * (`money.ts`), keeping the "AI returns raw numbers, code does the maths" line
 * clean.
 */

// --- request -------------------------------------------------------------

/** Upper bound on the free-text prompt — a sentence or two, not a document. */
export const AI_DRAFT_PROMPT_MAX = 2000;

/** Placeholder / teaching examples for the input box (backlog 7.2.5). */
export const AI_DRAFT_EXAMPLE_PROMPTS = [
  'Web design for Acme, 3 pages at €150 each, due in 15 days.',
  'Consulting retainer for Balkan Freight — 20 hours at 45 EUR/hour, 18% VAT, net 30.',
  '2 days on-site training for Skopje Logistics, 800 EUR/day, payable on receipt.',
] as const;

export const aiDraftRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Describe the invoice you want to draft.')
    .max(AI_DRAFT_PROMPT_MAX, 'That description is too long — keep it to a sentence or two.'),
});
export type AiDraftRequest = z.infer<typeof aiDraftRequestSchema>;

// --- model output (structured, strict) ---------------------------------

/**
 * One extracted line. `quantity` and `unitPriceAmount` are human decimals
 * (`3`, `2.5`, `150`, `45.5`); the API converts them to `quantityMilli` /
 * `unitPriceMinor`. `taxRatePercent` is a rate the prompt *stated* (`18` for
 * "18% VAT"), never one the model chose — `null` when unstated (the API leaves
 * tax at 0 and flags it uncertain).
 */
export const aiExtractedLineItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(1_000_000).nullable(),
  unit: z.string().trim().max(24).nullable(),
  unitPriceAmount: z.number().nonnegative().max(100_000_000).nullable(),
  taxRatePercent: z.number().nonnegative().max(1000).nullable(),
});
export type AiExtractedLineItem = z.infer<typeof aiExtractedLineItemSchema>;

/** `YYYY-MM-DD`, used for dates the model was given outright. */
const aiIsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');

/**
 * The whole structured response the LLM must produce (7.1.1). `apps/api` parses
 * every model reply through this and retries once on failure (7.1.2); a second
 * failure is surfaced as a graceful error with no usage charged (7.1.8).
 *
 * Unknown keys are stripped, not rejected — if the model bolts on a `total` it is
 * silently dropped rather than triggering a pointless retry, and the API would
 * never read it anyway (guardrail 7.1.3).
 */
export const aiExtractionSchema = z.object({
  client: z.object({
    /** `null` when the prompt names no customer. */
    name: z.string().trim().max(200).nullable(),
    email: z.string().trim().max(320).nullable(),
    /** Free-text address block exactly as stated; the API stores it as one blob. */
    address: z.string().trim().max(600).nullable(),
    taxId: z.string().trim().max(64).nullable(),
  }),
  lineItems: z.array(aiExtractedLineItemSchema).max(INVOICE_LINE_ITEMS_MAX),
  /** Absolute issue date when the prompt gives one ("dated today", "issued 1 March"),
   *  else `null` → the API uses today (UTC). */
  issueDate: aiIsoDate.nullable(),
  /** Relative payment window ("due in 15 days", "net 30") — the API turns this
   *  into a real date. `null` when no due date is implied. */
  dueInDays: z.number().int().min(0).max(3650).nullable(),
  /** Absolute due date when the prompt states one outright ("due 5 April"). Takes
   *  precedence over `dueInDays` when both are somehow present. */
  dueDate: aiIsoDate.nullable(),
  /** ISO 4217 the prompt mentions ("in USD", "45 EUR/hour"), else `null` → the
   *  API falls back to the tenant default currency. */
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  reference: z.string().trim().max(120).nullable(),
  notes: z.string().trim().max(4000).nullable(),
});
export type AiExtraction = z.infer<typeof aiExtractionSchema>;

// --- response (editable draft for the form) ---------------------------

/** A line ready for the invoice form — integer minor units / basis points, same
 *  shape the form's `lineItems` array expects. `discountBp` is always 0: the AI
 *  never applies a discount. */
export const aiDraftLineItemSchema = z.object({
  description: z.string(),
  quantityMilli: z.number().int().min(1).max(INVOICE_QUANTITY_MILLI_MAX),
  unit: z.string().nullable(),
  unitPriceMinor: z.number().int().min(0).max(INVOICE_UNIT_PRICE_MINOR_MAX),
  taxRateBp: z.number().int().min(0).max(INVOICE_TAX_RATE_BP_MAX),
  discountBp: z.literal(0),
});
export type AiDraftLineItem = z.infer<typeof aiDraftLineItemSchema>;

/** The invoice fields the AI populated. Everything derived (totals, tax summary,
 *  the invoice number) is left to the normal save path. */
export const aiInvoiceDraftSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  language: z.enum(PROFILE_LANGUAGES),
  currency: z.string(),
  issueDate: aiIsoDate,
  dueDate: aiIsoDate.nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  lineItems: z.array(aiDraftLineItemSchema),
});
export type AiInvoiceDraft = z.infer<typeof aiInvoiceDraftSchema>;

/** Confidence at or above which a fuzzy name match is treated as "this is that
 *  client" rather than "looks new" (backlog 7.1.4). Normalised edit-distance
 *  ratio, 0–1. */
export const AI_CLIENT_MATCH_THRESHOLD = 0.82;

export const aiClientMatchSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('matched'),
    clientId: z.string(),
    name: z.string(),
    /** 1 for an exact normalised match, else the ratio that cleared the threshold. */
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    kind: z.literal('new'),
    /** Prefilled "create client" fields the form can accept as-is (backlog 7.1.4
     *  — "flag as new"). */
    suggested: z.object({
      name: z.string(),
      email: z.string().nullable(),
      taxId: z.string().nullable(),
      addressMode: z.literal('FREE_TEXT'),
      addressText: z.string().nullable(),
    }),
  }),
  z.object({ kind: z.literal('none') }),
]);
export type AiClientMatch = z.infer<typeof aiClientMatchSchema>;

/** Remaining-generations meter for the panel (backlog 7.2.4) — the same numbers
 *  `GET /billing/entitlements` reports, echoed here so the form needs one call. */
export const aiUsageSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative().nullable(),
  remaining: z.number().int().nonnegative().nullable(),
  periodResetsAt: z.string().datetime().nullable(),
});
export type AiUsage = z.infer<typeof aiUsageSchema>;

export const aiDraftResponseSchema = z.object({
  draft: aiInvoiceDraftSchema,
  clientMatch: aiClientMatchSchema,
  /** Top-level field names the AI filled — the form highlights these so the user
   *  knows what to verify (backlog 7.2.3). e.g. `['client','dueDate','lineItems']`. */
  filledFields: z.array(z.string()),
  /** Fields the prompt did not pin down and the AI left blank rather than guess
   *  (guardrail 7.1.3) — the form nudges the user to complete them. */
  uncertainFields: z.array(z.string()),
  /** Human notes about what could not be resolved ("No due date mentioned"). */
  warnings: z.array(z.string()),
  ai: aiUsageSchema,
});
export type AiDraftResponse = z.infer<typeof aiDraftResponseSchema>;

// --- cost logging (backlog 7.1.7) -------------------------------------

/**
 * Outcome of one generation attempt, mirrors the Prisma `AiGenerationStatus`
 * enum — keep the two in step. Exactly one `AiGenerationLog` row is written per
 * attempt, successes and failures alike, so the admin cost view (backlog 8.4.1)
 * accounts for wasted spend too. A request rejected by the monthly cap never
 * reaches the model and writes no row.
 */
export const AI_GENERATION_STATUSES = [
  'SUCCESS',
  /** Model reply failed `aiExtractionSchema` twice (7.1.2). No usage charged. */
  'INVALID_OUTPUT',
  /** Provider threw / timed out / is unconfigured (7.1.8). No usage charged. */
  'PROVIDER_ERROR',
  /** Provider-side 429. No usage charged. */
  'RATE_LIMITED',
] as const;
export type AiGenerationStatus = (typeof AI_GENERATION_STATUSES)[number];

/** `costMicros` unit: millionths of one major currency unit (integer, decision
 *  D17 style — no floats). Provider pricing is quoted in USD, so this is USD
 *  micros; the admin view labels it. */
export const AI_COST_MICROS_PER_MAJOR = 1_000_000;
