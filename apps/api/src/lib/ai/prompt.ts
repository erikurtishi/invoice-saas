import { aiExtractionSchema } from '@invoice-saas/shared';
import { z } from 'zod';

import type { AiDraftContext } from './drafter.js';

/**
 * Provider-independent prompt + schema construction. Both concrete adapters
 * (`ClaudeDrafter`, `CustomDrafter`) build their request from here so the model
 * is asked for exactly the same thing regardless of who serves it — the only
 * per-provider code is the transport.
 *
 * The extraction rules live in `ai-draft-service.ts` (guardrails 7.1.3, retry
 * 7.1.2, UTC date resolution 7.1.5, fuzzy client match 7.1.4); this prompt only
 * has to get a well-formed `aiExtractionSchema` object back.
 */

/** JSON Schema (Draft 2020-12) for the structured reply, derived straight from
 *  the Zod schema so the two can never drift. Used as an Anthropic tool
 *  `input_schema` and embedded in the system prompt for plain JSON-mode models. */
export const AI_EXTRACTION_JSON_SCHEMA: Record<string, unknown> = z.toJSONSchema(
  aiExtractionSchema as unknown as z.ZodType,
  { target: 'draft-2020-12' },
);

/** The single tool a tool-use provider (Claude) is forced to call. */
export const AI_DRAFT_TOOL_NAME = 'emit_invoice_draft';

const SYSTEM_RULES = [
  'You extract structured invoice data from one or two sentences of plain language.',
  'Return ONLY what the text states or clearly implies. Never invent a client, an amount, a tax rate or a date that was not given — use null for anything unstated.',
  'Do NOT compute any money. No subtotal, no tax total, no grand total, no line totals. Return each stated unit price and quantity as a plain number exactly as written ("€150" -> 150, "2.5 hours" -> 2.5).',
  'taxRatePercent is only a rate the text explicitly states ("18% VAT" -> 18); otherwise null.',
  'Dates: if the text gives a relative payment window ("due in 15 days", "net 30") return it as dueInDays (an integer). Only set issueDate / dueDate when the text gives an outright calendar date, formatted YYYY-MM-DD.',
  'currency is a 3-letter ISO code only when the text names one; otherwise null.',
].join('\n');

/** System prompt shared by every provider. `today` and `defaultCurrency` anchor
 *  relative phrasing; `knownClientNames` lets the model reconcile "bill Acme" to
 *  the saved spelling (the authoritative match still runs in the service). */
export function buildSystemPrompt(ctx: AiDraftContext): string {
  const parts = [
    SYSTEM_RULES,
    `Today is ${ctx.today} (UTC). The account's default currency is ${ctx.defaultCurrency}.`,
  ];
  if (ctx.knownClientNames.length > 0) {
    parts.push(
      `Existing client names, for reconciling a shortened reference to its saved spelling:\n${ctx.knownClientNames
        .slice(0, 100)
        .map((n) => `- ${n}`)
        .join('\n')}`,
    );
  }
  if (ctx.repairHint) {
    parts.push(
      `Your previous reply was rejected: ${ctx.repairHint}\nReturn a corrected object that satisfies the schema.`,
    );
  }
  return parts.join('\n\n');
}

/** User-turn content: the raw prompt, plus the schema for providers that have no
 *  native tool/schema channel (the custom OpenAI-compatible path). */
export function buildUserPrompt(ctx: AiDraftContext, opts: { includeSchema: boolean }): string {
  if (!opts.includeSchema) return ctx.prompt;
  return [
    ctx.prompt,
    '',
    'Reply with a single JSON object and nothing else. It must conform to this JSON Schema:',
    JSON.stringify(AI_EXTRACTION_JSON_SCHEMA),
  ].join('\n');
}
