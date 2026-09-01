import {
  AiProviderError,
  type AiDrafter,
  type AiDraftContext,
  type AiDraftRawResult,
} from './drafter.js';
import { buildSystemPrompt, buildUserPrompt } from './prompt.js';

/**
 * `AiDrafter` for a self-hosted / self-built model exposed over an
 * OpenAI-compatible `POST {baseUrl}/chat/completions` endpoint (backlog L1.2.2 —
 * the "add a model that I might create" option). Works with vLLM, llama.cpp's
 * server, LM Studio, Ollama's `/v1`, or any bespoke service that speaks that
 * shape. Selected in `lib/ai/index.ts` when `AI_PROVIDER=custom`.
 *
 * No native tool/schema channel is assumed: the JSON Schema is embedded in the
 * user turn and the request asks for `response_format: json_object`. Whatever
 * comes back is parsed as JSON and handed up raw — `ai-draft-service.ts` still
 * validates it against `aiExtractionSchema` and retries once on failure, so a
 * weaker model degrades to a friendly error rather than a bad invoice.
 */

interface CustomDrafterOptions {
  /** Base URL including any version segment, e.g. `http://localhost:11434/v1`. */
  baseUrl: string;
  model: string;
  /** Optional bearer token; omit for an unauthenticated local server. */
  apiKey?: string | undefined;
  timeoutMs?: number;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class CustomDrafter implements AiDrafter {
  readonly available = true;
  readonly model: string;
  private readonly url: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: CustomDrafterOptions) {
    this.model = options.model;
    this.url = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }

  async draft(ctx: AiDraftContext): Promise<AiDraftRawResult> {
    const body = {
      model: this.model,
      temperature: 0,
      stream: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user', content: buildUserPrompt(ctx, { includeSchema: true }) },
      ],
    };

    const data = await this.post(body);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AiProviderError('malformed_response', 'The model returned an empty reply.');
    }

    let extraction: unknown;
    try {
      extraction = JSON.parse(stripFences(content));
    } catch {
      throw new AiProviderError('malformed_response', 'The model reply was not valid JSON.');
    }

    return {
      extraction,
      model: data.model ?? this.model,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  private async post(body: unknown): Promise<ChatCompletionResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'AbortError';
      throw new AiProviderError(
        timedOut ? 'provider_timeout' : 'network_error',
        timedOut ? 'The model request timed out.' : 'Could not reach the model endpoint.',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new AiProviderError(
        response.status === 429 ? 'rate_limited' : `http_${response.status}`,
        `Model endpoint responded ${response.status}.`,
        { rateLimited: response.status === 429 },
      );
    }

    return (await response.json()) as ChatCompletionResponse;
  }
}

/** Some servers wrap JSON output in a ```json … ``` block despite json-mode. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence ? fence[1]! : trimmed;
}
