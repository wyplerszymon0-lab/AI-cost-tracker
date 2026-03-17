/**
 * openai-wrapper.ts
 * Wraps the OpenAI client so every chat.completions.create() call
 * is automatically recorded in the CostTracker.
 */

import type OpenAI from 'openai';
import { CostTracker } from './tracker';

export interface WrapOptions {
  sessionId?: string;
  tags?: string[];
}

/**
 * Returns a proxied OpenAI client where chat.completions.create
 * is intercepted to record token usage in the tracker.
 *
 * Usage:
 *   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 *   const tracked = wrapOpenAI(openai, tracker, { sessionId: 'my-session' });
 *   const res = await tracked.chat.completions.create({ model: 'gpt-4o-mini', messages });
 *   // Usage is automatically recorded in tracker
 */
export function wrapOpenAI(
  client: OpenAI,
  tracker: CostTracker,
  defaultOptions: WrapOptions = {},
): OpenAI {
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  const wrappedCreate = async function (
    params: Parameters<typeof originalCreate>[0],
    options?: Parameters<typeof originalCreate>[1],
  ) {
    const startMs = Date.now();
    // @ts-ignore — overload complexity; works at runtime
    const response = await originalCreate(params, options);
    const latencyMs = Date.now() - startMs;

    // Non-streaming path
    if (response && typeof response === 'object' && 'usage' in response && response.usage) {
      const usage = response.usage as {
        prompt_tokens: number;
        completion_tokens: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };

      tracker.record({
        model: (params as { model: string }).model,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
        sessionId: defaultOptions.sessionId,
        tags: defaultOptions.tags ?? [],
        latencyMs,
      });
    }

    return response;
  };

  // Shallow proxy: replace only the create method
  const proxied = Object.create(client);
  proxied.chat = Object.create(client.chat);
  proxied.chat.completions = Object.create(client.chat.completions);
  proxied.chat.completions.create = wrappedCreate;

  return proxied as OpenAI;
}
