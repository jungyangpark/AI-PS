/**
 * Shared Claude model settings for all server-side LLM calls.
 *
 * Override the model with the CLAUDE_MODEL env var (e.g. CLAUDE_MODEL=claude-haiku-4-5).
 *
 * Notes for Claude Opus 5.5:
 * - Thinking is always on; it cannot be disabled. `effort` is the only control
 *   (low | medium | high | xhigh | max, default medium). Lower effort = faster/cheaper.
 * - Thinking tokens count toward max_tokens, so max_tokens must leave room for it.
 * - The response may start with a `thinking` block - always look up the `text` block.
 */
import Anthropic from '@anthropic-ai/sdk';

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const isOpus55 = () => CLAUDE_MODEL.startsWith('claude-opus-5-5');

/**
 * Model + effort fields to spread into messages.create().
 * `output_config` is not in the installed SDK (0.39) types, so the return type only
 * exposes `model`; the extra field is still sent in the request body.
 */
export function modelParams(effort: Effort): { model: string } {
  if (!isOpus55()) {
    return { model: CLAUDE_MODEL };
  }
  return {
    model: CLAUDE_MODEL,
    output_config: { effort },
    // Server-side refusal fallback (needs the beta header from requestOptions())
    fallbacks: 'default',
  } as { model: string };
}

/** Request options: beta header for server-side refusal fallback on Opus 5.5. */
export function requestOptions(): Anthropic.RequestOptions | undefined {
  if (!isOpus55()) {
    return undefined;
  }
  return { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } };
}

/** Returns the first text block's text (skips thinking blocks). */
export function getResponseText(response: Anthropic.Message): string {
  if (response.stop_reason === ('refusal' as any)) {
    console.warn('[Claude] Request was declined (stop_reason: refusal)');
  }
  const block = response.content?.find(b => b.type === 'text');
  return block && block.type === 'text' ? block.text : '';
}
