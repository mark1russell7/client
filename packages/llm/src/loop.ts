/**
 * The tool loop of `llm.complete` and `llm.stream`.
 *
 * The loop sends a request and reads the answer. When the answer asks only for procedure tools,
 * the loop starts them, sends the answer and the results back, and asks again. It stops when the
 * model stops, or when `maxRounds` requests went out. The two procedures differ only in one
 * step: `llm.complete` gets each answer as JSON, and `llm.stream` reads the event stream of each
 * answer. A `SendTurn` function does that step.
 */

import type { ProcedurePath } from "@procedures/client";
import { addUsage, NO_USAGE, type CallLimits, type ContentBlock, type LlmSettings, type MessagesRequest } from "./anthropic.js";
import { addTools, baseRequest, retriesOf, timeoutOf, toolParam } from "./request.js";
import { DEFAULT_MAX_ROUNDS, procedureTools, runToolUse, type ToolContext } from "./tools.js";
import type { LlmRequestInput, LlmStreamToolCall, LlmStreamToolResult, LlmToolCall, LlmToolInput, LlmToolUse, LlmUsage } from "./types.js";

/** One answer of the model, as the loop reads it. */
export interface TurnAnswer {
  /** The model that answered. */
  readonly model: string;
  /** The content blocks of the answer. The next request has them unchanged. */
  readonly content: readonly ContentBlock[];
  /** Why the model stopped. */
  readonly stopReason: string;
  /** The tokens of the request. */
  readonly usage: LlmUsage;
  /** The text of the answer. */
  readonly text: string;
  /** The `tool_use` blocks of the answer. */
  readonly toolUses: readonly LlmToolUse[];
}

/**
 * One request of the loop. The function sends the request, with at most `retries` new tries.
 * It gives the items of the answer. Its return value is the answer.
 */
export type SendTurn<T> = (request: MessagesRequest, settings: LlmSettings, limits: CallLimits, retries: number) => AsyncGenerator<T, TurnAnswer, undefined>;

/** An item of the loop: the start or the end of a procedure tool. */
export type ToolEvent = LlmStreamToolCall | LlmStreamToolResult;

/** The end of the loop. */
export interface LoopEnd {
  /** The last answer. */
  readonly answer: TurnAnswer;
  /** The model of the last answer. Without one, it is the model of the request. */
  readonly model: string;
  /** The tokens of all the requests, added together. */
  readonly usage: LlmUsage;
  /** The text of all the answers, joined. */
  readonly text: string;
  /** The calls of procedure tools, in their sequence. */
  readonly toolCalls: LlmToolCall[];
  /** The number of requests to the model. */
  readonly rounds: number;
  /** True when `maxRounds` stopped the loop before the model stopped. */
  readonly roundLimit: boolean;
}

/** A forced `tool_choice` (`any` or `tool`) applies to the first request only. After it, the model can stop. */
function releaseToolChoice(request: MessagesRequest): void {
  const choice = request.tool_choice;
  if (choice === undefined || (choice.type !== "any" && choice.type !== "tool")) return;
  const { disable_parallel_tool_use } = choice;
  request.tool_choice = { type: "auto", ...(disable_parallel_tool_use !== undefined ? { disable_parallel_tool_use } : {}) };
}

/**
 * This function does the tool loop of one call. It gives the items of each answer and an item at
 * the start and at the end of each procedure tool. The return value is the end of the loop. It
 * throws before the first request for a tool that the host refuses or that is not valid.
 */
export async function* toolLoop<T>(
  input: LlmRequestInput & LlmToolInput,
  ctx: ToolContext | undefined,
  settings: LlmSettings,
  path: ProcedurePath,
  send: SendTurn<T>,
): AsyncGenerator<T | ToolEvent, LoopEnd, undefined> {
  const request = baseRequest(input, settings, input.system);
  const procedures = procedureTools(input.procedures ?? [], ctx, path);
  addTools(request, [...(input.tools ?? []).map(toolParam), ...procedures.map((tool) => tool.param)], input.toolChoice);
  const byName = new Map(procedures.map((tool) => [tool.param.name, tool]));
  const limits: CallLimits = { path, ctx, timeoutMs: timeoutOf(input) };
  const retries = retriesOf(input.retries, settings);
  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;

  let usage: LlmUsage = NO_USAGE;
  let text = "";
  const toolCalls: LlmToolCall[] = [];
  for (let round = 1; ; round++) {
    const answer = yield* send(request, settings, limits, retries);
    usage = addUsage(usage, answer.usage);
    text += answer.text;
    const uses = answer.toolUses;
    // The procedure runs the tools only when each tool of the answer is a procedure tool
    const runnable = answer.stopReason === "tool_use" && uses.length > 0 && uses.every((use) => byName.has(use.name));
    if (!runnable || round >= maxRounds) {
      return { answer, model: answer.model || request.model, usage, text, toolCalls, rounds: round, roundLimit: runnable };
    }
    // One at a time, in the sequence of the answer: a procedure can change data that the next one reads
    const results: ContentBlock[] = [];
    for (const use of uses) {
      const tool = byName.get(use.name)!;
      yield { type: "tool_call", round, id: use.id, name: use.name, procedure: tool.key, input: use.input };
      const { call, result } = await runToolUse(use, tool, ctx!);
      toolCalls.push(call);
      results.push(result);
      yield { type: "tool_result", round, ...call };
    }
    // The next request continues the conversation: the answer as it came, then the results
    request.messages = [...request.messages, { role: "assistant", content: answer.content }, { role: "user", content: results }];
    releaseToolChoice(request);
  }
}

/** This function reads a generator to its end and gives its return value. It ignores the items. */
export async function returnOf<R>(generator: AsyncGenerator<unknown, R, undefined>): Promise<R> {
  for (;;) {
    const step = await generator.next();
    if (step.done) return step.value;
  }
}
