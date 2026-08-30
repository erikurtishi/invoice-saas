/**
 * The AI drafting port (backlog Epic 7.1, spec §8). Everything that turns a
 * plain-language prompt into structured invoice data depends on this interface,
 * never on a concrete LLM provider — the same "pluggable adapter" shape as the
 * `Mailer` (D13), `Storage` (D15) and billing (D23) ports.
 *
 * Task 7.1.1 (the concrete provider integration) is deliberately deferred:
 * Anthropic vs OpenAI is still an open decision. `NullDrafter` is the only
 * implementation today, so `/ai/*` returns 503 until an adapter is wired — a
 * degraded state, not a crash, exactly like billing with no `STRIPE_SECRET_KEY`.
 * When the provider is chosen it is one new class implementing `AiDrafter` plus a
 * one-line swap in `lib/ai/index.ts`; nothing in `ai-draft-service.ts` changes.
 *
 * The port's job stops at "return the model's JSON and the token counts". All
 * validation (`aiExtractionSchema`), the retry, the guardrails, relative-date
 * resolution, client matching, metering and cost logging live in
 * `services/ai-draft-service.ts` so they are provider-independent and testable
 * with a fake `AiDrafter`.
 */

export interface AiDraftContext {
  /** The tenant's raw prompt, already trimmed and length-checked. */
  prompt: string;
  /** Today's date as `YYYY-MM-DD` in **UTC** (7.1.5 decision — no per-tenant
   *  timezone yet). The adapter passes this to the model so "issued today" /
   *  "due in 15 days" are anchored consistently; the service still resolves the
   *  relative offset itself. */
  today: string;
  /** The tenant's default currency (ISO 4217) — the model uses it when the
   *  prompt names no currency. */
  defaultCurrency: string;
  /** Names of the tenant's existing clients, for the model to reconcile against
   *  ("bill Acme" → prefer the saved "Acme Trading LLC" spelling). The
   *  authoritative fuzzy match still runs in the service (7.1.4). */
  knownClientNames: string[];
  /** Present on the retry only (7.1.2): a short description of why the previous
   *  reply failed `aiExtractionSchema`, for the adapter to append to the prompt. */
  repairHint?: string;
}

export interface AiDraftRawResult {
  /** The model's reply, parsed from JSON but NOT yet validated — the service
   *  runs it through `aiExtractionSchema`. `unknown` on purpose. */
  extraction: unknown;
  /** The model id that produced this (for the cost log). */
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiDrafter {
  /** Whether a real provider is configured. `false` → `NullDrafter`; the route
   *  layer turns a call into a 503 rather than pretending. */
  readonly available: boolean;
  /** The model id this drafter would use, or `"none"` when unconfigured. */
  readonly model: string;
  /** Ask the model for one structured draft. Throws `AiProviderError` on any
   *  transport / provider failure (7.1.8); returns raw JSON otherwise. */
  draft(ctx: AiDraftContext): Promise<AiDraftRawResult>;
}

/** Thrown by an `AiDrafter` when the provider is unreachable, errored, timed out
 *  or is unconfigured. The service catches it, logs a `PROVIDER_ERROR` row with
 *  no usage charged, and surfaces a friendly message (7.1.8). */
export class AiProviderError extends Error {
  /** Machine reason for the cost log's `errorReason` column. */
  readonly reason: string;
  /** True for a provider-side 429 → logged as `RATE_LIMITED`. */
  readonly rateLimited: boolean;

  constructor(reason: string, message: string, options?: { rateLimited?: boolean }) {
    super(message);
    this.name = 'AiProviderError';
    this.reason = reason;
    this.rateLimited = options?.rateLimited ?? false;
  }
}
