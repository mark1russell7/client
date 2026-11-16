/**
 * The error of a nested call that a limit of the host refuses. The class has its own module: the
 * error response of each transport reads it, and a transport does not reach the server.
 */

import type { ServerResponse } from "./types.js";

/** The metadata key of the wait before a retry, in milliseconds. */
const RETRY_AFTER = "retry-after";

/**
 * The error of a nested call that a limit refuses. It has the code, the message, the retryable flag
 * and the metadata of the response of the refusal (`rateLimitedResponse`), thus the response of a
 * caller that gets this error is the same as a refusal at the door.
 */
export class CallLimitError extends Error {
  override readonly name = "CallLimitError";
  /** `RATE_LIMITED` for a wait refusal, `PAYLOAD_TOO_LARGE` for a capacity refusal. */
  readonly code: string;
  readonly retryable: boolean;
  /** The wait before a retry, in milliseconds. Undefined for a capacity refusal. */
  readonly retryAfterMs: number | undefined;
  /** The metadata of the refusal: `reason`, `retry-after`, and `units` and `capacity` for a capacity refusal. */
  readonly limitMetadata: Readonly<Record<string, unknown>>;

  constructor(response: ServerResponse<unknown>) {
    const status = response.status;
    super(status.type === "error" ? status.message : "A limit of the host refuses the call");
    this.code = status.type === "error" ? String(status.code) : "RATE_LIMITED";
    this.retryable = status.type === "error" ? status.retryable === true : false;
    const wait = response.metadata?.[RETRY_AFTER];
    this.retryAfterMs = typeof wait === "number" ? wait : undefined;
    this.limitMetadata = { ...response.metadata };
  }
}
