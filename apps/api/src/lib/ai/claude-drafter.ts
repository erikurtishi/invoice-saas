import {
  AiProviderError,
  type AiDrafter,
  type AiDraftContext,
  type AiDraftRawResult,
} from './drafter.js';
import {
  AI_DRAFT_TOOL_NAME,
  AI_EXTRACTION_JSON_SCHEMA,
  buildSystemPrompt,
  buildUserPrompt,
} from './prompt.js';

/**
 * `AiDrafter` for Anthropic's Messages API (backlog 7.1.1 / L1.2.2 — the
 * "use an existing Haiku model" option). Selected in `lib/ai/index.ts` when
 * `AI_PROVIDER=anthropic`; nothing here runs unless a key is configured, so the
 * default build stays on `NullDrafter`.
 *
 * Deliberately dependency-free (plain `fetch`, no `@anthropic-ai/sdk`): the port
 * only needs "send the prompt, hand back raw JSON + token counts". Structured
 * output is a forced single-tool call whose `input_schema` is
 * `aiExtractionSchema` (`prompt.ts`), so the model must return an object of the
 * right shape; all validation, retry and guardrails stay in
 * `ai-draft-service.ts`.
 */

const ANTHROPIC_VERSION = '2023-06-01';

interface ClaudeDrafterOptions {
  apiKey: string;
  model: string;
  /** Override for self-routing / a proxy. Defaults to the public API. */
  baseUrl?: string;
  /** Wall-clock budget for one call. */
  timeoutMs?: number;
}

interface AnthropicContentBlock {
  type: string;
  name?: string;
  input?: unknown;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class ClaudeDrafter implements AiDrafter {
  readonly available = true;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: ClaudeDrafterOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async draft(ctx: AiDraftContext): Promise<AiDraftRawResult> {
    const body = {
      model: this.model,
      max_tokens: 1500,
      system: buildSystemPrompt(ctx),
      messages: [{ role: 'user', content: buildUserPrompt(ctx, { includeSchema: false }) }],
      tools: [
        {
          name: AI_DRAFT_TOOL_NAME,
          description: 'Return the structured invoice data extracted from the prompt.',
          input_schema: AI_EXTRACTION_JSON_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: AI_DRAFT_TOOL_NAME },
    };

    const res = await this.post(body);
    const toolUse = (res.content ?? []).find(
      (block) => block.type === 'tool_use' && block.name === AI_DRAFT_TOOL_NAME,
    );
    if (!toolUse || toolUse.input === undefined) {
      throw new AiProviderError(
        'malformed_response',
        'The model did not return a structured draft.',
      );
    }

    return {
      extraction: toolUse.input,
      model: res.model ?? this.model,
      inputTokens: res.usage?.input_tokens ?? 0,
      outputTokens: res.usage?.output_tokens ?? 0,
    };
  }

  private async post(body: unknown): Promise<AnthropicResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'AbortError';
      throw new AiProviderError(
        timedOut ? 'provider_timeout' : 'network_error',
        timedOut ? 'The model request timed out.' : 'Could not reach the model provider.',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const detail = await safeErrorMessage(response);
      throw new AiProviderError(
        response.status === 429 ? 'rate_limited' : `http_${response.status}`,
        `Model provider responded ${response.status}${detail ? `: ${detail}` : ''}`,
        { rateLimited: response.status === 429 },
      );
    }

    return (await response.json()) as AnthropicResponse;
  }
}

async function safeErrorMessage(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    return data.error?.message ?? null;
  } catch {
    return null;
  }
}
