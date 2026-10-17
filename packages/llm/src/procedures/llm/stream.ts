/**
 * llm.stream procedure
 *
 * Send a prompt to a language model and stream the events of the answer. The request has
 * `"stream": true`. The items are the start of the message, the text deltas and each complete
 * `tool_use` block. The last item has the stop reason, the usage and the full text.
 *
 * With `procedures`, the procedure starts the tools, as `llm.complete` does: `toolLoop` of
 * `loop.ts` has the loop. When an answer stops for its procedure tools, the stream gives a
 * `tool_call` item and a `tool_result` item for each tool. Then the next answer streams in the
 * same output.
 */

import { DEFAULT_LLM_SETTINGS, type LlmSettings } from "../../anthropic.js";
import { streamMessages } from "../../events.js";
import { toolLoop } from "../../loop.js";
import type { ToolContext } from "../../tools.js";
import type { LlmStreamInput, LlmStreamOutput, LlmStreamStop } from "../../types.js";

const PATH = ["llm", "stream"];

/**
 * Send a prompt to a language model and stream the events of the answer
 */
export async function* llmStream(input: LlmStreamInput, ctx?: ToolContext, settings: LlmSettings = DEFAULT_LLM_SETTINGS): AsyncGenerator<LlmStreamOutput, void, undefined> {
  const end = yield* toolLoop(input, ctx, settings, PATH, streamMessages);
  const stop: LlmStreamStop = {
    type: "stop",
    model: end.model,
    stopReason: end.answer.stopReason,
    usage: end.usage,
    text: end.text,
    toolUses: [...end.answer.toolUses],
  };
  // Without procedures, the stop item keeps the fields that it had before the tool loop
  if ((input.procedures ?? []).length > 0) {
    stop.toolCalls = end.toolCalls;
    stop.rounds = end.rounds;
    stop.roundLimit = end.roundLimit;
  }
  yield stop;
}
