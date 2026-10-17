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
  /** The content blocks of the answer. The next request sends them back, after `continuationOf()`. */
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

/** The block types that the next turn drops before the final `fallback` block. */
const DROPPED_BEFORE_FALLBACK = new Set(["thinking", "redacted_thinking", "connector_text", "tool_use"]);

/**
 * The content of an answer as the next request sends it back. After a server-side fallback in
 * the middle of an answer, the blocks before the final `fallback` block came from the model that
 * declined. The next turn drops their thinking, their `connector_text` and their client
 * `tool_use` blocks, and each server tool use without its result. The `fallback` block, the
 * text and each block after the final `fallback` block stay where they are. Without a `fallback`
 * block, the content stays as it came. The rules are in the API docs, "Refusals and fallback",
 * section "Continuing the conversation". Before, the loop sent the content back unchanged, and
 * the next request could fail (tracker O34).
 */
export function continuationOf(content: readonly ContentBlock[]): ContentBlock[] {
  let last = -1;
  for (let index = content.length - 1; index >= 0; index--) {
    if (content[index]!.type === "fallback") {
      last = index;
      break;
    }
  }
  if (last < 0) return [...content];
  // A server tool result names its tool use. The results can come after the fallback too.
  const results = new Set(content.map((block) => block["tool_use_id"]).filter((id): id is string => typeof id === "string"));
  const kept = content.slice(0, last).filter((block) => {
    if (DROPPED_BEFORE_FALLBACK.has(block.type)) return false;
    if (block.type.endsWith("_tool_use")) return typeof block["id"] === "string" && results.has(block["id"]);
    return true;
  });
  return [...kept, ...content.slice(last)];
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
    // Only the tool uses that the next turn sends back can get a result: none before a fallback
    const content = continuationOf(answer.content);
    const sent = new Set(content.filter((block) => block.type === "tool_use").map((block) => block["id"]));
    const uses = answer.toolUses.filter((use) => sent.has(use.id));
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
    // The next request continues the conversation: the answer (without the blocks that a fallback
    // replaced), then the results
    request.messages = [...request.messages, { role: "assistant", content }, { role: "user", content: results }];
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
