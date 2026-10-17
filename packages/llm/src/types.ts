/**
 * Type definitions of the procedures of this package
 *
 * mark procedure new adds the types of each new procedure here. The zod schemas are in
 * `module.ts`: an exported schema needs a written type (isolatedDeclarations).
 */

/** The effort of the model: how much it thinks and how many tokens it spends. */
export type LlmEffort = "low" | "medium" | "high" | "xhigh" | "max";

/** The tokens of a call. */
export interface LlmUsage {
  /** The tokens of the input that the cache did not have. */
  inputTokens: number;
  /** The tokens of the output, with the tokens of the thinking. */
  outputTokens: number;
  /** The tokens of the input that came from the cache. */
  cacheReadInputTokens: number;
  /** The tokens of the input that went into the cache. */
  cacheCreationInputTokens: number;
}

/** The fields of a request that each procedure takes. */
export interface LlmRequestInput {
  /** The text of the user. */
  prompt: string;
  /** The system text: the instructions to the model. */
  system?: string | undefined;
  /** The model. The default is the model of the module (`claude-sonnet-5-5`). */
  model?: string | undefined;
  /** The most tokens of the output, with the thinking. The default is 16000. */
  maxTokens?: number | undefined;
  /** The temperature, from 0 to 1. Some models accept only the default, and the API refuses another value. */
  temperature?: number | undefined;
  /** The effort of the model. Without it, the model uses its default. */
  effort?: LlmEffort | undefined;
  /** The time limit of each request to the API, in milliseconds. The default is 600000 (10 minutes). */
  timeoutMs?: number | undefined;
  /**
   * True: when a safety classifier declines the request, the API runs it again on the fallback
   * model that it recommends. The default is the option of the module (true).
   */
  fallback?: boolean | undefined;
}

// =============================================================================
// Tools
// =============================================================================

/** A tool that the model can use: the API gets its name, its description and the schema of its input. */
export interface LlmTool {
  /** The name of the tool: 1 to 128 letters, digits, `_` and `-`. */
  name: string;
  /** The text that tells the model what the tool does and when to use it. */
  description?: string | undefined;
  /** The JSON Schema of the input of the tool. Its type is `object`. */
  inputSchema: Record<string, unknown>;
  /** True: the API makes the input of each call agree with the schema (strict tool use). */
  strict?: boolean | undefined;
}

/**
 * How the model uses the tools. `auto` (the default): the model decides. `any`: the model uses a
 * tool. `tool`: the model uses the tool that `name` gives. `none`: the model uses no tool.
 * Some models refuse `any` and `tool` with a 400 error: Claude Sonnet 5.5, Claude Opus 5.5 and
 * Claude Fable 5.1.
 */
export type LlmToolChoice =
  | { type: "auto"; disableParallelToolUse?: boolean | undefined }
  | { type: "any"; disableParallelToolUse?: boolean | undefined }
  | { type: "tool"; name: string; disableParallelToolUse?: boolean | undefined }
  | { type: "none" };

/** The tool fields of `llm.complete` and `llm.stream`. */
export interface LlmToolInput {
  /** The tools that the model can use. The caller runs them: the output gives each `tool_use` block. */
  tools?: LlmTool[] | undefined;
  /** How the model uses the tools (`tool_choice`). */
  toolChoice?: LlmToolChoice | undefined;
  /** The number of new tries after an error with `retryable: true`: 0 to 10. The default is the option of the module (2). */
  retries?: number | undefined;
}

/** A `tool_use` block of an answer: a call of a tool that the model asks for. */
export interface LlmToolUse {
  /** The ID of the block. A `tool_result` gives it back. */
  id: string;
  /** The name of the tool. */
  name: string;
  /** The input of the call. */
  input: unknown;
}

/** A call of a procedure tool that `llm.complete` made for the model. */
export interface LlmToolCall {
  /** The ID of the `tool_use` block. */
  id: string;
  /** The name of the tool. */
  name: string;
  /** The key of the procedure, for example `weather.current`. */
  procedure: string;
  /** The input that the model gave. */
  input: unknown;
  /** True when the procedure failed. The model got the error as a `tool_result` with `is_error: true`. */
  isError: boolean;
  /** The output of the procedure. */
  output?: unknown;
  /** The message of the error of the procedure. */
  error?: string | undefined;
}

// =============================================================================
// llm.complete
// =============================================================================

export interface LlmCompleteInput extends LlmRequestInput, LlmToolInput {
  /**
   * The keys of the procedures that the model can use as tools, for example `weather.current`.
   * `llm.complete` calls each one through `ctx.client`, sends the result to the model, and asks again.
   */
  procedures?: string[] | undefined;
  /** The most requests to the model in one call: 1 to 64. The default is 8. */
  maxRounds?: number | undefined;
}

export interface LlmCompleteOutput {
  /** The text of the last answer: its text blocks, joined. */
  text: string;
  /** The model that answered. After a fallback, it is the fallback model. */
  model: string;
  /** Why the model stopped: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use` or another reason of the API. */
  stopReason: string;
  /** The tokens of all the requests. */
  usage: LlmUsage;
  /** The `tool_use` blocks of the last answer that no procedure ran. */
  toolUses: LlmToolUse[];
  /** The calls of procedure tools, in their sequence. */
  toolCalls: LlmToolCall[];
  /** The number of requests to the model. */
  rounds: number;
  /** True when `maxRounds` stopped the loop before the model stopped. */
  roundLimit: boolean;
}

// =============================================================================
// llm.structured
// =============================================================================

export interface LlmStructuredInput extends LlmRequestInput {
  /** The JSON Schema of the value. */
  schema: Record<string, unknown>;
  /**
   * True (default): the API constrains the output to the schema (structured outputs). The
   * procedure removes the keywords that the API does not support, and examines them after the
   * answer. False: the system text gives the schema, and the procedure examines the answer.
   */
  constrained?: boolean | undefined;
  /** The number of new tries after an answer that is not valid: 0 to 2. The default is 2. */
  retries?: number | undefined;
  /** The number of new tries of a request after an error with `retryable: true`: 0 to 10. The default is the option of the module (2). */
  requestRetries?: number | undefined;
}

export interface LlmStructuredOutput {
  /** The value: the schema accepts it. */
  value: unknown;
  /** The model that gave the value. */
  model: string;
  /** The number of calls to the model: 1 to 3. */
  attempts: number;
  /** The tokens of all the calls. */
  usage: LlmUsage;
  /** The keywords of the schema that the check does not examine, or examines only in part. */
  unchecked: string[];
}

// =============================================================================
// llm.stream Types - Send a prompt to a language model and stream the events of the answer
// =============================================================================

export interface LlmStreamInput extends LlmRequestInput, LlmToolInput {}

/** The first item of a stream: the event `message_start`. */
export interface LlmStreamStart {
  type: "start";
  /** The ID of the message. */
  id: string;
  /** The model that answers. */
  model: string;
  /** The tokens at the start: the tokens of the input. */
  usage: LlmUsage;
}

/** A part of the text of a text block: the delta `text_delta`. */
export interface LlmStreamText {
  type: "text";
  /** The index of the content block. */
  index: number;
  /** The new text. */
  text: string;
}

/** A complete `tool_use` block, after its event `content_block_stop`. */
export interface LlmStreamToolUse {
  type: "tool_use";
  /** The index of the content block. */
  index: number;
  /** The ID of the block. */
  id: string;
  /** The name of the tool. */
  name: string;
  /** The input of the call, or null when its JSON is not complete. */
  input: unknown;
  /** The JSON text of an input that does not parse: for example, the output stopped at `maxTokens`. */
  partialJson?: string | undefined;
}

/** The last item of a stream: the event `message_stop`, with the stop reason and the usage. */
export interface LlmStreamStop {
  type: "stop";
  /** The model that answered. After a fallback, it is the fallback model. */
  model: string;
  /** Why the model stopped. */
  stopReason: string;
  /** The tokens of the call. */
  usage: LlmUsage;
  /** The text of the answer: all the text deltas, joined. */
  text: string;
  /** The `tool_use` blocks of the answer. */
  toolUses: LlmToolUse[];
}

/** One item of `llm.stream`. */
export type LlmStreamOutput = LlmStreamStart | LlmStreamText | LlmStreamToolUse | LlmStreamStop;
