/**
 * The last-resort catch of a face (roadmap CLI-80): when `handle()` throws, or the face fails after
 * it. This module has no runtime import, so a face in a browser bundle (for example
 * `PortTransport`) does not load the error policy and its imports. The policy itself runs in the
 * server, through `RequestHandler.exposeError`.
 */

import type { ExposedError } from "./error-policy.js";
import type { RequestHandler, ServerRequest } from "./types.js";

/** The error that a last-resort catch sends without a policy: `INTERNAL_ERROR` with the message of the error. */
export function rawErrorOf(error: unknown): ExposedError {
  return { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message || "Internal server error" : String(error), retryable: false };
}

/**
 * The error that the last-resort catch of a face sends: the error policy of the handler
 * (`RequestHandler.exposeError`, which `Server` has), or `raw` for a handler without one. `raw`
 * is the error that the face sends without a policy.
 */
export function lastResortError(handler: RequestHandler, error: unknown, request: ServerRequest<unknown> | undefined, raw: ExposedError = rawErrorOf(error)): ExposedError {
  return handler.exposeError ? handler.exposeError(error, request, raw) : raw;
}
