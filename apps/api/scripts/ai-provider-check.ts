/**
 * L1.2.2 — smoke-test whichever concrete `AiDrafter` is configured, without
 * touching the DB or the metering pipeline (that's `npm run ai:check`).
 *
 *   npm run ai:provider-check -w @invoice-saas/api
 *
 * With no AI_PROVIDER set it just confirms the app is on `NullDrafter` (nothing
 * connected) and prints how to wire one. With `AI_PROVIDER=anthropic|custom` it
 * makes one real `draft()` call and checks the reply satisfies
 * `aiExtractionSchema`.
 */
import { aiExtractionSchema } from '@invoice-saas/shared';

import { env } from '../src/config/env.js';
import { aiDrafter } from '../src/lib/ai/index.js';
import type { AiDraftContext } from '../src/lib/ai/drafter.js';

const ctx: AiDraftContext = {
  prompt: 'Web design for Acme, 3 pages at 150 EUR each, 18% VAT, due in 15 days.',
  today: new Date().toISOString().slice(0, 10),
  defaultCurrency: 'EUR',
  knownClientNames: ['Acme Trading LLC', 'Balkan Freight'],
};

async function main(): Promise<void> {
  console.info(`AI_PROVIDER=${env.AI_PROVIDER ?? '(unset)'}  ·  drafter.model=${aiDrafter.model}`);

  if (!env.AI_PROVIDER) {
    if (aiDrafter.available) {
      console.error('✗ no AI_PROVIDER but drafter reports available — expected NullDrafter');
      process.exit(1);
    }
    console.info(
      '✓ NullDrafter active — nothing connected. Set AI_PROVIDER=anthropic (+ ANTHROPIC_API_KEY,\n' +
        '  AI_MODEL) or AI_PROVIDER=custom (+ AI_BASE_URL, AI_MODEL) to enable drafting.',
    );
    return;
  }

  console.info(`\nCalling ${env.AI_PROVIDER} (${aiDrafter.model}) …`);
  const started = Date.now();
  const raw = await aiDrafter.draft(ctx);
  console.info(
    `← ${Date.now() - started}ms  ·  tokens in/out: ${raw.inputTokens}/${raw.outputTokens}  ·  model: ${raw.model}`,
  );
  console.info(JSON.stringify(raw.extraction, null, 2));

  const parsed = aiExtractionSchema.safeParse(raw.extraction);
  if (!parsed.success) {
    console.error('\n✗ reply does NOT satisfy aiExtractionSchema:');
    console.error(
      parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'),
    );
    process.exit(1);
  }
  console.info('\n✓ reply satisfies aiExtractionSchema — the drafter is wired correctly.');
}

main().catch((err) => {
  console.error('\n✗ FAILED:', err);
  process.exit(1);
});
