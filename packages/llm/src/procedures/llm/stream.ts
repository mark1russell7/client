/**
 * llm.stream procedure
 *
 * Send a prompt to a language model and stream the events of the answer. The request has
 * `"stream": true`. The items are the start of the message, the text deltas and each complete
 * `tool_use` block. The last item has the stop reason, the usage and the full text.
 */

import { DEFAULT_LLM_SETTINGS, type CallLimits, type LlmSettings } from "../../anthropic.js";
import { streamMessages } from "../../events.js";
import { addTools, baseRequest, retriesOf, timeoutOf, toolParam } from "../../request.js";
import type { LlmStreamInput, LlmStreamOutput } from "../../types.js";

const PATH = ["llm", "stream"];

/**
 * Send a prompt to a language model and stream the events of the answer
 */
export async function* llmStream(input: LlmStreamInput, ctx?: CallLimits["ctx"], settings: LlmSettings = DEFAULT_LLM_SETTINGS): AsyncGenerator<LlmStreamOutput, void, undefined> {
  const request = baseRequest(input, settings, input.system);
  addTools(request, (input.tools ?? []).map(toolParam), input.toolChoice);
  yield* streamMessages(request, settings, { path: PATH, ctx, timeoutMs: timeoutOf(input) }, retriesOf(input.retries, settings));
}
