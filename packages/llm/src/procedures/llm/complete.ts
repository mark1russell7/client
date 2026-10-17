/**
 * llm.complete procedure
 *
 * Send a prompt to a language model and give the text and the usage. The text is the text
 * blocks of the last answer, joined: the thinking blocks are not in it.
 *
 * With `tools`, the output gives each `tool_use` block of the answer, and the caller starts them.
 * With `procedures`, the procedure starts the tools. It calls each procedure that the model asks
 * for through `ctx.client` and sends the results back. Then it asks again, until the model stops
 * or `maxRounds` requests went out.
 */

import { addUsage, DEFAULT_LLM_SETTINGS, NO_USAGE, sendWithRetries, textOf, type CallLimits, type ContentBlock, type LlmSettings } from "../../anthropic.js";
import { addTools, baseRequest, retriesOf, timeoutOf, toolParam } from "../../request.js";
import { DEFAULT_MAX_ROUNDS, procedureTools, runToolUse, toolUsesOf, type ToolContext } from "../../tools.js";
import type { LlmCompleteInput, LlmCompleteOutput, LlmToolCall, LlmUsage } from "../../types.js";

const PATH = ["llm", "complete"];

/**
 * Send a prompt to a language model and give the text and the usage
 */
export async function llmComplete(input: LlmCompleteInput, ctx?: ToolContext, settings: LlmSettings = DEFAULT_LLM_SETTINGS): Promise<LlmCompleteOutput> {
  const request = baseRequest(input, settings, input.system);
  const procedures = procedureTools(input.procedures ?? [], ctx, PATH);
  addTools(request, [...(input.tools ?? []).map(toolParam), ...procedures.map((tool) => tool.param)], input.toolChoice);
  const byName = new Map(procedures.map((tool) => [tool.param.name, tool]));
  const limits: CallLimits = { path: PATH, ctx, timeoutMs: timeoutOf(input) };
  const retries = retriesOf(input.retries, settings);
  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;

  let usage: LlmUsage = NO_USAGE;
  const toolCalls: LlmToolCall[] = [];
  for (let round = 1; ; round++) {
    const answer = await sendWithRetries(request, settings, limits, retries);
    usage = addUsage(usage, answer.usage);
    const uses = toolUsesOf(answer.content);
    // The procedure runs the tools only when each tool of the answer is a procedure tool
    const runnable = answer.stopReason === "tool_use" && uses.length > 0 && uses.every((use) => byName.has(use.name));
    if (!runnable || round >= maxRounds) {
      return {
        text: textOf(answer.content),
        model: answer.model || request.model,
        stopReason: answer.stopReason,
        usage,
        toolUses: uses,
        toolCalls,
        rounds: round,
        roundLimit: runnable,
      };
    }
    // One at a time, in the sequence of the answer: a procedure can change data that the next one reads
    const results: ContentBlock[] = [];
    for (const use of uses) {
      const { call, result } = await runToolUse(use, byName.get(use.name)!, ctx!);
      toolCalls.push(call);
      results.push(result);
    }
    // The next request continues the conversation: the answer as it came, then the results
    request.messages = [...request.messages, { role: "assistant", content: answer.content }, { role: "user", content: results }];
    // A forced tool_choice applies to the first request only: then the model can stop
    if (request.tool_choice !== undefined && (request.tool_choice.type === "any" || request.tool_choice.type === "tool")) {
      const { disable_parallel_tool_use } = request.tool_choice;
      request.tool_choice = { type: "auto", ...(disable_parallel_tool_use !== undefined ? { disable_parallel_tool_use } : {}) };
    }
  }
}
