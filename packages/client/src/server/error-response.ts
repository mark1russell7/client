/**
 * The error response of the server, and the link from an error status to its real error (roadmap
 * CLI-80).
 *
 * The error policy of a server (`error-policy.ts`) reads the real error of a response: the error
 * object that a handler threw, of its own class. Two links lead to it, and neither is a field of
 * the response, so the wire, a log of the response and a deep comparison never see them:
 * - The status object of the error response. A copy of the response (`{ ...response, id }`) keeps
 *   the same status.
 * - The request object of the call, with the code and the message of the status. A copy of the
 *   status (`{ ...response.status }`, for example in a middleware or a wrapper) keeps the code
 *   and the message, so the link holds. A status with another code or message is another error,
 *   and has no link.
 * - Without a link (a middleware copied both the request and the status, or made a new error),
 *   the policy gives `map` a `ServerError` of the code, the message and the retryable flag of the
 *   status.
 */

import { InvocationError } from "../procedures/invoke.js";
import { VERSION_CONFLICTS_METADATA_KEY, versionConflictsOf } from "../procedures/collection/precondition.js";
import { errorCodeOf, retryableOf } from "../protocol.js";
import type { ServerResponse } from "./types.js";

/** The real error of each error status that the server made from an error. */
const ERRORS_OF_STATUSES = new WeakMap<object, unknown>();

/** The last real error of each request, with the code and the message of its status. */
const ERRORS_OF_REQUESTS = new WeakMap<object, { readonly code: string; readonly message: string; readonly error: unknown }>();

/** The metadata keys that an error response gets from its error: the reason, the wait and the conflicts. */
export const ERROR_METADATA_KEYS: ReadonlySet<string> = new Set(["reason", "retry-after", "retryAfterMs", VERSION_CONFLICTS_METADATA_KEY, "details", "cause", "data"]);

/**
 * This function records the real error of an error response, for the error policy: by its status
 * object, and by the request object of the call. The response does not change.
 *
 * @internal
 */
export function withRealError<T extends ServerResponse<unknown>>(response: T, error: unknown, request?: object): T {
  ERRORS_OF_STATUSES.set(response.status, error);
  const status = response.status;
  if (request !== undefined && status.type === "error") ERRORS_OF_REQUESTS.set(request, { code: String(status.code), message: status.message, error });
  return response;
}

/**
 * The real error of an error status of a request, or `{ found: false }` when no link leads to it.
 *
 * @internal
 */
export function realErrorOf(response: ServerResponse<unknown>, request?: object): { readonly found: true; readonly error: unknown } | { readonly found: false } {
  const status = response.status;
  if (ERRORS_OF_STATUSES.has(status)) return { found: true, error: ERRORS_OF_STATUSES.get(status) };
  const recorded = request !== undefined ? ERRORS_OF_REQUESTS.get(request) : undefined;
  if (recorded !== undefined && status.type === "error" && recorded.code === String(status.code) && recorded.message === status.message) return { found: true, error: recorded.error };
  return { found: false };
}

/**
 * The error response of a failed invocation. An invocation error keeps its code
 * (VALIDATION_ERROR, NOT_EXPOSED, ABORTED and so on). An error of the handler keeps its own code
 * when it is a string, as for a stream (`WIRE-PROTOCOL.md`). Without a code, it is HANDLER_ERROR.
 * An error without a retryable flag gets the flag of its code in `ERROR_CODES`, or false (CLI-48).
 * An in-band end before the first item of a stream gets the same default. After the first item,
 * an in-band end without a flag gets false (`retryableOf`, CLI-58, CLI-68, `WIRE-PROTOCOL.md`,
 * section "Error codes"). `request` is the request of the call: the link of the error policy to the
 * real error (CLI-80).
 */
export function errorResponse(id: string, error: unknown, request?: object): ServerResponse<unknown> {
  // A refusal of the capability says why (CAPABILITIES-2026-10)
  const reason = error instanceof InvocationError ? error.reason : undefined;
  // An error can ask the client to wait before a retry: retryAfterMs, in milliseconds (R12)
  const retryAfterMs = (error as { retryAfterMs?: unknown } | undefined)?.retryAfterMs;
  const metadata: Record<string, unknown> = reason ? { reason } : {};
  if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) metadata["retry-after"] = retryAfterMs;
  // A VERSION_CONFLICT error tells the current item of each conflict (roadmap CLI-16)
  const conflicts = versionConflictsOf(error);
  if (conflicts !== undefined) metadata[VERSION_CONFLICTS_METADATA_KEY] = conflicts;
  const code = errorCodeOf(error);
  // The error policy of the server (CLI-80) reads the real error of the response
  return withRealError({
    id,
    status: {
      type: "error",
      code,
      message: error instanceof Error ? error.message : String(error),
      // An error that says it is retryable stays retryable: before, every error lost the flag (deep
      // dive TRN-7). Without a flag, the default of the code: UNAVAILABLE stays retryable, and
      // keeps HTTP 503 (CLI-48). No item went out before this response.
      retryable: retryableOf(error, 0),
    },
    metadata,
  }, error, request);
}
