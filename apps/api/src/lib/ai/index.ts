import type { AiDrafter } from './drafter.js';
import { NullDrafter } from './null-drafter.js';

export type { AiDrafter, AiDraftContext, AiDraftRawResult } from './drafter.js';
export { AiProviderError } from './drafter.js';
export { estimateCostMicros, AI_MODEL_PRICING } from './cost.js';

/**
 * The process-wide AI drafter. `NullDrafter` for now (backlog 7.1.1 — the
 * provider is undecided, so `/ai/*` returns 503; same "degrade, don't crash"
 * shape as billing with no Stripe key).
 *
 * TODO(7.1.1): when Anthropic / OpenAI is chosen, construct the concrete adapter
 * here — e.g. `env.ANTHROPIC_API_KEY ? new ClaudeDrafter(env.ANTHROPIC_API_KEY,
 * env.AI_MODEL) : new NullDrafter()`. Nothing else changes: `ai-draft-service.ts`
 * only knows the `AiDrafter` interface.
 */
function createDrafter(): AiDrafter {
  return new NullDrafter();
}

export const aiDrafter: AiDrafter = createDrafter();

/** True when a real provider is wired — lets the web hide the AI panel instead of
 *  surfacing a 503 on submit (mirrors `GET /billing/config`). */
export const aiDraftingEnabled = aiDrafter.available;
