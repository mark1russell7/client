/**
 * The errors of the llm procedures. A stop of the call (its time limit, its deadline, the abort of
 * the caller) is an `InvocationError` with the code `TIMEOUT` or `ABORTED`.
 */

/** The reason of an `LlmError`. */
export type LlmErrorCode =
  /** The environment variable of the API key has no value. */
  | "NO_API_KEY"
  /** The API answered with an error status, or sent an error event in a stream. */
  | "API_ERROR"
  /** The connection to the API failed, or a stream ended before its end event. */
  | "CONNECTION"
  /** The answer of the API does not have the form of a message or of a stream of events. */
  | "BAD_RESPONSE"
  /** A safety classifier declined the request (`stop_reason: "refusal"`). */
  | "REFUSAL"
  /** A tool definition is not valid: a name that two tools have, or a procedure without an object input. */
  | "BAD_TOOL"
  /** `llm.structured`: the output stopped at `maxTokens`, so the JSON is not complete. */
  | "MAX_TOKENS"
  /** `llm.structured`: no answer gave a value that the schema accepts. */
  | "INVALID_OUTPUT";

/** The options of an `LlmError`. */
export interface LlmErrorOptions {
  readonly status?: number | undefined;
  readonly retryable?: boolean | undefined;
  readonly retryAfterMs?: number | undefined;
}

/** An error of a call to the model. */
export class LlmError extends Error {
  override readonly name = "LlmError";
  readonly code: LlmErrorCode;
  /** The HTTP status of an `API_ERROR`. An error event of a stream has no status. */
  readonly status: number | undefined;
  /** True when the same call can succeed later: a rate limit, an overload, a server error or a connection error. */
  readonly retryable: boolean;
  /** The wait that the API asked for with `retry-after-ms` or `retry-after`, in milliseconds. */
  readonly retryAfterMs: number | undefined;

  constructor(code: LlmErrorCode, message: string, options: LlmErrorOptions = {}) {
    super(message);
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}
