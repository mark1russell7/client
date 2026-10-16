/**
 * The errors of the llm procedures. A stop of the call (its time limit, its deadline, the abort of
 * the caller) is an `InvocationError` with the code `TIMEOUT` or `ABORTED`.
 */

/** The reason of an `LlmError`. */
export type LlmErrorCode =
  /** The environment variable of the API key has no value. */
  | "NO_API_KEY"
  /** The API answered with an error status. `status` has it. */
  | "API_ERROR"
  /** The connection to the API failed. */
  | "CONNECTION"
  /** The answer of the API does not have the form of a message. */
  | "BAD_RESPONSE"
  /** A safety classifier declined the request (`stop_reason: "refusal"`). */
  | "REFUSAL"
  /** `llm.structured`: the output stopped at `maxTokens`, so the JSON is not complete. */
  | "MAX_TOKENS"
  /** `llm.structured`: no answer gave a value that the schema accepts. */
  | "INVALID_OUTPUT";

/** An error of a call to the model. */
export class LlmError extends Error {
  override readonly name = "LlmError";
  readonly code: LlmErrorCode;
  /** The HTTP status of an `API_ERROR`. */
  readonly status: number | undefined;
  /** True when the same call can succeed later: a rate limit, an overload, a server error or a connection error. */
  readonly retryable: boolean;

  constructor(code: LlmErrorCode, message: string, options: { status?: number | undefined; retryable?: boolean | undefined } = {}) {
    super(message);
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
