/**
 * llm.complete procedure
 *
 * Send a prompt to a language model and give the text and the usage. The text is the text
 * blocks of the last answer, joined: the thinking blocks are not in it.
 *
 * With `tools`, the output gives each `tool_use` block of the answer, and the caller starts them.
 * With `procedures`, the procedure starts the tools. It calls each procedure that the model asks
 * for through `ctx.client` and sends the results back. Then it asks again, until the model stops
 * or `maxRounds` requests went out. `toolLoop` of `loop.ts` has the loop, and `llm.stream` uses
 * the same loop.
 */

import { DEFAULT_LLM_SETTINGS, sendWithRetries, textOf, type CallLimits, type LlmSettings, type MessagesRequest } from "../../anthropic.js";
import { returnOf, toolLoop, type TurnAnswer } from "../../loop.js";
import { toolUsesOf, type ToolContext } from "../../tools.js";
import type { LlmCompleteInput, LlmCompleteOutput } from "../../types.js";

const PATH = ["llm", "complete"];

/** One request of `llm.complete`: it gives no items. Its return value is the JSON answer. */
async function* sendTurn(request: MessagesRequest, settings: LlmSettings, limits: CallLimits, retries: number): AsyncGenerator<never, TurnAnswer, undefined> {
  const answer = await sendWithRetries(request, settings, limits, retries);
  return {
    model: answer.model,
    content: answer.content,
    stopReason: answer.stopReason,
    usage: answer.usage,
    text: textOf(answer.content),
    toolUses: toolUsesOf(answer.content),
  };
}

/**
 * Send a prompt to a language model and give the text and the usage
 */
export async function llmComplete(input: LlmCompleteInput, ctx?: ToolContext, settings: LlmSettings = DEFAULT_LLM_SETTINGS): Promise<LlmCompleteOutput> {
  const end = await returnOf(toolLoop(input, ctx, settings, PATH, sendTurn));
  return {
    text: end.answer.text,
    model: end.model,
    stopReason: end.answer.stopReason,
    usage: end.usage,
    toolUses: [...end.answer.toolUses],
    toolCalls: end.toolCalls,
    rounds: end.rounds,
    roundLimit: end.roundLimit,
  };
}
