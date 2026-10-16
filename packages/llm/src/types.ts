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
  /** The time limit of the call, in milliseconds. The default is 600000 (10 minutes). */
  timeoutMs?: number | undefined;
  /**
   * True: when a safety classifier declines the request, the API runs it again on the fallback
   * model that it recommends. The default is the option of the module (true).
   */
  fallback?: boolean | undefined;
}

// =============================================================================
// llm.complete
// =============================================================================

export type LlmCompleteInput = LlmRequestInput;

export interface LlmCompleteOutput {
  /** The text of the answer: the text blocks, joined. */
  text: string;
  /** The model that answered. After a fallback, it is the fallback model. */
  model: string;
  /** Why the model stopped: `end_turn`, `max_tokens`, `stop_sequence` or another reason of the API. */
  stopReason: string;
  usage: LlmUsage;
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
