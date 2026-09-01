import { env } from '../../config/env.js';
import { ClaudeDrafter } from './claude-drafter.js';
import { CustomDrafter } from './custom-drafter.js';
import type { AiDrafter } from './drafter.js';
import { NullDrafter } from './null-drafter.js';

export type { AiDrafter, AiDraftContext, AiDraftRawResult } from './drafter.js';
export { AiProviderError } from './drafter.js';
export { estimateCostMicros, AI_MODEL_PRICING } from './cost.js';

/**
 * The process-wide AI drafter (backlog 7.1.1 / L1.2.2). Selected from
 * `AI_PROVIDER`:
 *
 *   unset      → `NullDrafter`   — nothing is connected; `/ai/*` 503s and the web
 *                                  hides the panel. This is the default build and
 *                                  what CI / `ai:check` run against.
 *   anthropic  → `ClaudeDrafter` — an existing hosted model (e.g. Claude Haiku),
 *                                  `ANTHROPIC_API_KEY` + `AI_MODEL`.
 *   custom     → `CustomDrafter` — your own OpenAI-compatible endpoint,
 *                                  `AI_BASE_URL` + `AI_MODEL` (+ optional
 *                                  `AI_API_KEY`).
 *
 * `config/env.ts` refuses to boot if a provider is named without its required
 * settings, so an invalid combo fails fast rather than 503-ing at request time.
 * Every guardrail (schema validation, retry, metering, cost) lives in
 * `ai-draft-service.ts` and is identical whichever adapter is active.
 */
function createDrafter(): AiDrafter {
  switch (env.AI_PROVIDER) {
    case 'anthropic':
      return new ClaudeDrafter({ apiKey: env.ANTHROPIC_API_KEY!, model: env.AI_MODEL! });
    case 'custom':
      return new CustomDrafter({
        baseUrl: env.AI_BASE_URL!,
        model: env.AI_MODEL!,
        apiKey: env.AI_API_KEY,
      });
    default:
      return new NullDrafter();
  }
}

export const aiDrafter: AiDrafter = createDrafter();

/** True when a real provider is wired — lets the web hide the AI panel instead of
 *  surfacing a 503 on submit (mirrors `GET /billing/config`). */
export const aiDraftingEnabled = aiDrafter.available;
