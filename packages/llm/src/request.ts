/**
 * The request of the fields that the procedures take (`LlmRequestInput`), and the tool fields.
 */

import { DEFAULT_MAX_TOKENS, DEFAULT_TIMEOUT_MS, type LlmSettings, type MessagesRequest, type ToolChoiceParam, type ToolParam } from "./anthropic.js";
import { LlmError } from "./errors.js";
import { MAX_REQUEST_RETRIES } from "./retry.js";
import type { LlmRequestInput, LlmTool, LlmToolChoice } from "./types.js";

/** This function gives the body of a request: the model, the limits, the system text and the user text. */
export function baseRequest(input: LlmRequestInput, settings: LlmSettings, system: string | undefined): MessagesRequest {
  const request: MessagesRequest = {
    model: input.model ?? settings.defaultModel,
    max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: [{ role: "user", content: input.prompt }],
  };
  if (system !== undefined && system !== "") request.system = system;
  if (input.temperature !== undefined) request.temperature = input.temperature;
  if (input.effort !== undefined) request.output_config = { effort: input.effort };
  if (input.fallback ?? settings.fallback) request.fallbacks = "default";
  return request;
}

/** The time limit of a request. */
export function timeoutOf(input: LlmRequestInput): number {
  return input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

/** The number of new tries after a retryable error: the input, or the default of the module. */
export function retriesOf(given: number | undefined, settings: LlmSettings): number {
  return Math.min(Math.max(given ?? settings.retries, 0), MAX_REQUEST_RETRIES);
}

/** The definition of a tool of the input, as the API gets it. */
export function toolParam(tool: LlmTool): ToolParam {
  return {
    name: tool.name,
    ...(tool.description !== undefined ? { description: tool.description } : {}),
    input_schema: tool.inputSchema,
    ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
  };
}

/** The `tool_choice` of the input, as the API gets it. */
export function toolChoiceParam(choice: LlmToolChoice): ToolChoiceParam {
  if (choice.type === "none") return { type: "none" };
  return {
    type: choice.type,
    ...(choice.type === "tool" ? { name: choice.name } : {}),
    ...(choice.disableParallelToolUse !== undefined ? { disable_parallel_tool_use: choice.disableParallelToolUse } : {}),
  };
}

/**
 * This function puts the tools and the `tool_choice` into a request. It throws `BAD_TOOL` for two
 * tools with the same name, and for a `toolChoice` without tools.
 */
export function addTools(request: MessagesRequest, tools: readonly ToolParam[], choice: LlmToolChoice | undefined): void {
  const names = new Set<string>();
  for (const tool of tools) {
    if (names.has(tool.name)) throw new LlmError("BAD_TOOL", `llm: two tools have the name ${tool.name}`);
    names.add(tool.name);
  }
  if (choice !== undefined && tools.length === 0) throw new LlmError("BAD_TOOL", "llm: toolChoice needs tools");
  if (choice?.type === "tool" && !names.has(choice.name)) throw new LlmError("BAD_TOOL", `llm: toolChoice names the tool ${choice.name}, and no tool has that name`);
  if (tools.length > 0) request.tools = [...tools];
  if (choice !== undefined) request.tool_choice = toolChoiceParam(choice);
}
