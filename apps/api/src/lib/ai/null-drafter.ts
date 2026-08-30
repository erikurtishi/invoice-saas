import { AiProviderError, type AiDrafter, type AiDraftRawResult } from './drafter.js';

/**
 * The no-op drafter used until a real LLM provider is wired (backlog 7.1.1,
 * deferred). Mirrors `NullBilling`: the app boots fine, but any attempt to draft
 * throws `AiProviderError`, which the route layer turns into a 503 and the
 * service logs as `PROVIDER_ERROR` with no usage charged.
 */
export class NullDrafter implements AiDrafter {
  readonly available = false;
  readonly model = 'none';

  draft(): Promise<AiDraftRawResult> {
    return Promise.reject(
      new AiProviderError(
        'provider_unconfigured',
        'AI drafting is not configured on this server. Set an LLM provider key to enable it.',
      ),
    );
  }
}
