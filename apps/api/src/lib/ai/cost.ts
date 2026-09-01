import { AI_COST_MICROS_PER_MAJOR } from '@invoice-saas/shared';

/**
 * Token → cost estimation for the AI cost log (backlog 7.1.7; the admin
 * aggregate is 8.4.1). Kept out of the concrete adapter so the figure is
 * consistent no matter which provider 7.1.1 eventually wires, and so it can be
 * corrected in one place when prices move.
 *
 * `costMicros` is millionths of one USD (integer — decision D17 style). An
 * unpriced / unknown model yields `0` rather than throwing: a missing price must
 * never break a generation.
 */

interface ModelRate {
  /** USD per 1M input tokens. */
  inputPerMTokUsd: number;
  /** USD per 1M output tokens. */
  outputPerMTokUsd: number;
}

/**
 * Published list prices, USD per million tokens. Extend when 7.1.1 picks a
 * provider/model. Keys are exact model ids so the log's `model` column maps
 * straight through.
 */
export const AI_MODEL_PRICING: Record<string, ModelRate> = {
  // Anthropic (list, 2026-Q3). Alias + dated ids both resolve — keep both.
  'claude-haiku-4-5': { inputPerMTokUsd: 1, outputPerMTokUsd: 5 },
  'claude-haiku-4-5-20251001': { inputPerMTokUsd: 1, outputPerMTokUsd: 5 },
  'claude-sonnet-5': { inputPerMTokUsd: 3, outputPerMTokUsd: 15 },
  // OpenAI (list, 2026-Q3)
  'gpt-4o-mini': { inputPerMTokUsd: 0.15, outputPerMTokUsd: 0.6 },
  'gpt-4o': { inputPerMTokUsd: 2.5, outputPerMTokUsd: 10 },
};

/** Integer USD-micros for a generation. `0` for an unknown model or zero tokens. */
export function estimateCostMicros(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = AI_MODEL_PRICING[model];
  if (!rate) return 0;
  const usd =
    (Math.max(0, inputTokens) / 1_000_000) * rate.inputPerMTokUsd +
    (Math.max(0, outputTokens) / 1_000_000) * rate.outputPerMTokUsd;
  return Math.round(usd * AI_COST_MICROS_PER_MAJOR);
}
