/**
 * llm.complete procedure
 *
 * Send a prompt to a language model and give the text and the usage. The text is the text
 * blocks of the answer, joined: the thinking blocks are not in it.
 */

import { DEFAULT_LLM_SETTINGS, sendMessages, textOf, type CallLimits, type LlmSettings } from "../../anthropic.js";
import { baseRequest, timeoutOf } from "../../request.js";
import type { LlmCompleteInput, LlmCompleteOutput } from "../../types.js";

const PATH = ["llm", "complete"];

/**
 * Send a prompt to a language model and give the text and the usage
 */
export async function llmComplete(input: LlmCompleteInput, ctx?: CallLimits["ctx"], settings: LlmSettings = DEFAULT_LLM_SETTINGS): Promise<LlmCompleteOutput> {
  const request = baseRequest(input, settings, input.system);
  const answer = await sendMessages(request, settings, { path: PATH, ctx, timeoutMs: timeoutOf(input) });
  return {
    text: textOf(answer.content),
    model: answer.model || request.model,
    stopReason: answer.stopReason,
    usage: answer.usage,
  };
}
