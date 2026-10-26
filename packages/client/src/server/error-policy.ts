/**
 * The error policy of a server (roadmap CLI-80): what an error tells the caller when it leaves
 * the process.
 *
 * `Server.handle()` applies the policy to each response, so each face of the server (HTTP,
 * WebSocket, MCP, a message port, the local face of a host) sends the same error. When
 * `handle()` throws, or a face fails after it (for example, a value that JSON cannot encode), the
 * last-resort catch of the face applies the same policy through `lastResortError`. A nested call
 * of `ctx.client` does not go through `handle()`, so it keeps the real error.
 *
 * - `expose: "all"` (the default): each error goes to the caller as before.
 * - `expose: "coded"`: an error with a known code (`isKnownErrorCode`, or a code of `codes`) goes
 *   to the caller as it is. Each other error goes to the caller as `INTERNAL_ERROR` with the
 *   message `"internal error"`, and the server logs it one time.
 * - `map` runs first. Its result goes to the caller as it is. `undefined` gives the error to
 *   `expose`.
 *
 * The policy reads the real error of a response through the links of `error-response.ts`: the
 * status object, and the request object with the code and the message of the status. A copy of
 * the response or of its status keeps a link.
 */

import type { ProcedurePath } from "../procedures/types.js";
import { closableUnread } from "../procedures/invoke.js";
import { isKnownErrorCode } from "../client/errors/registry.js";
import { errorCodeOf } from "../protocol.js";
import { errorResponse, realErrorOf } from "./error-response.js";
import { methodToPath } from "./method.js";
import { ServerError, type RequestHandler, type ServerRequest, type ServerResponse } from "./types.js";

/** The error that the caller gets: its code, its message and its retryable flag. A `ServerError` is one. */
export interface ExposedError {
  /** The error code, for example `NOT_FOUND`, or a code of the application. */
  readonly code: string;
  /** The message that the caller gets. */
  readonly message: string;
  /**
   * True when a retry of the same call can succeed. Without it, the error gets the flag of its
   * code before the first item of a stream, and false after it (`retryableOf`).
   */
  readonly retryable?: boolean | undefined;
  /** The wait before a retry, in milliseconds, as on an error of a handler (`Retry-After` on HTTP). */
  readonly retryAfterMs?: number | undefined;
}

/** The call of an error that leaves the server. */
export interface ErrorCall {
  /** The path of the procedure. Empty when the face failed before it knew the call. */
  readonly path: ProcedurePath;
  /** The face that took the request (`http`, `websocket`, `port`, `mcp`), when the face tells it. */
  readonly transport?: string | undefined;
}

/** The error policy of a server: the option `errors` (roadmap CLI-80). */
export interface ServerErrorPolicy {
  /**
   * Which errors go to the caller as they are:
   * - `"all"` (the default): each error, with its code and its message, as before.
   * - `"coded"`: only an error with a known code (`isKnownErrorCode`: `NOT_FOUND`, `FORBIDDEN`,
   *   `VALIDATION_ERROR`, `CONFLICT` and so on, or a code of `codes`), with its code, its
   *   message, its retryable flag and its metadata. Each other error goes to the caller as
   *   `INTERNAL_ERROR` with the message `"internal error"` and its real retryable flag, with
   *   only the metadata keys of `keepMetadata`. The codes `INTERNAL_ERROR`, `HANDLER_ERROR`, `UNKNOWN`,
   *   `OUTPUT_VALIDATION_ERROR` and `NO_OUTPUT` tell of a failure of the server, not of a
   *   refusal, so their message is hidden too. The server gives the real error to its `onError`
   *   logger one time, or to `console.error` without a logger.
   */
  readonly expose?: "all" | "coded" | undefined;
  /**
   * The codes of the application that also go to the caller as they are under `"coded"`, for
   * example `["QUOTA_EXCEEDED"]`.
   */
  readonly codes?: readonly string[] | undefined;
  /**
   * The metadata keys that a hidden error response or a `map` result keeps from the response: an
   * allowlist. Each other key goes, also a key that the server does not know (`issues`, a key of
   * the application). The default is `DEFAULT_KEPT_METADATA`: the trace keys `traceparent` and
   * `tracestate`.
   */
  readonly keepMetadata?: readonly string[] | undefined;
  /**
   * This function runs first, for each error that leaves the server. Its result goes to the
   * caller as it is, also with a code of the application, and with the metadata of an error of a
   * handler (`retryAfterMs`, the conflicts of a `VERSION_CONFLICT` error). `undefined` gives the
   * error to `expose`. A function that throws gives `INTERNAL_ERROR`.
   */
  readonly map?: ((error: unknown, call: ErrorCall) => ExposedError | undefined) | undefined;
}

/** The message of a hidden error. */
export const HIDDEN_ERROR_MESSAGE = "internal error";

/** The codes that tell of a failure of the server, not of a refusal: `"coded"` hides their message. */
const FAILURE_CODES: ReadonlySet<string> = new Set(["INTERNAL_ERROR", "HANDLER_ERROR", "UNKNOWN", "OUTPUT_VALIDATION_ERROR", "NO_OUTPUT"]);

/** The errors that a logger got: each path logs an error one time. */
const LOGGED = new WeakSet<object>();

/**
 * This function records that the logger of the server got this error, so the error policy does
 * not log it again.
 *
 * @internal
 */
export function markLogged(error: unknown): void {
  if (typeof error === "object" && error !== null) LOGGED.add(error);
}

/** The logger of the hidden errors: the hook `onError` of the server, or `console.error`. */
export type HiddenErrorLog = (error: unknown, request: ServerRequest<unknown> | undefined) => void;

/** This function gives an error to the logger, when the logger did not get it before. */
function logOnce(log: HiddenErrorLog, error: unknown, request: ServerRequest<unknown> | undefined): void {
  if (typeof error === "object" && error !== null && LOGGED.has(error)) return;
  markLogged(error);
  log(error, request);
}

/** True when the policy can change a response: `"coded"`, or a `map` function. */
export function policyActs(policy: ServerErrorPolicy | undefined): policy is ServerErrorPolicy {
  return policy !== undefined && (policy.expose === "coded" || policy.map !== undefined);
}

/**
 * The call of a request, for `map`.
 *
 * @internal
 */
export function callOf(request: ServerRequest<unknown> | undefined): ErrorCall {
  if (request === undefined) return { path: [] };
  let path: ProcedurePath;
  try {
    path = methodToPath(request.method);
  } catch {
    path = [];
  }
  return request.transport !== undefined ? { path, transport: request.transport } : { path };
}

/** The decision of the policy for one error. */
type Decision =
  | { readonly kind: "keep" }
  | { readonly kind: "replace"; readonly error: ExposedError }
  | { readonly kind: "hide" };

/**
 * The decision of the policy for one error. `code` is the code that the error has on the wire. A
 * `map` result is final. `"coded"` keeps an error with a code of `codes`, or with a known code
 * that is not a failure code.
 */
function decide(policy: ServerErrorPolicy, error: unknown, code: string, call: ErrorCall, logMapError: (error: unknown) => void): Decision {
  if (policy.map) {
    let mapped: ExposedError | undefined;
    try {
      mapped = policy.map(error, call);
    } catch (mapError) {
      logMapError(mapError);
      return { kind: "hide" };
    }
    if (mapped !== undefined) return { kind: "replace", error: mapped };
  }
  if (policy.expose !== "coded") return { kind: "keep" };
  if (policy.codes?.includes(code) === true) return { kind: "keep" };
  if (isKnownErrorCode(code) && !FAILURE_CODES.has(code)) return { kind: "keep" };
  return { kind: "hide" };
}

/** A `map` result as an error: a result that is not an `Error` becomes one, with its fields. */
function errorOfResult(result: ExposedError): Error {
  return result instanceof Error ? result : Object.assign(new Error(result.message), result);
}

/** The metadata keys that a hidden error response keeps by default: the trace keys (CLI-80). */
export const DEFAULT_KEPT_METADATA: readonly string[] = ["traceparent", "tracestate"];

/** The metadata of a response with only the keys of the allowlist `keepMetadata` of the policy. */
function keptMetadata(policy: ServerErrorPolicy, metadata: ServerResponse<unknown>["metadata"]): ServerResponse<unknown>["metadata"] {
  const keys = policy.keepMetadata ?? DEFAULT_KEPT_METADATA;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) if (keys.includes(key)) kept[key] = value;
  return kept as ServerResponse<unknown>["metadata"];
}

/**
 * This function applies the error policy to a response that leaves the server: to an error
 * status, and to the error that ends a stream.
 *
 * @internal
 */
export function exposedResponse<T>(policy: ServerErrorPolicy, request: ServerRequest<unknown>, response: ServerResponse<T>, log: HiddenErrorLog): ServerResponse<T> {
  const status = response.status;
  if (status.type === "error") {
    // A response that the server made without an error (a refusal of the token, a duplicate
    // stream), or a status without the link, gives `map` a ServerError of its status
    const link = realErrorOf(response, request);
    const real = link.found ? link.error : new ServerError(status.message, status.code, status.retryable);
    const decision = decide(policy, real, status.code, callOf(request), (mapError) => logOnce(log, mapError, request));
    if (decision.kind === "keep") return response;
    const { stream: _stream, payload: _payload, ...rest } = response;
    // Only the keys of the allowlist stay (the trace keys): an unknown key can tell of the error
    const kept = keptMetadata(policy, response.metadata);
    if (decision.kind === "replace") {
      // The usual error response of the result: its wait and its conflicts go out too
      const built = errorResponse(response.id, errorOfResult(decision.error));
      return { ...rest, status: built.status, metadata: { ...kept, ...built.metadata } };
    }
    logOnce(log, real, request);
    return {
      ...rest,
      // The retryable flag tells nothing private: a transient failure stays retryable
      status: { type: "error", code: "INTERNAL_ERROR", message: HIDDEN_ERROR_MESSAGE, retryable: status.retryable },
      metadata: kept,
    };
  }
  if (response.stream === undefined) return response;
  return { ...response, stream: exposedStream(policy, request, response.stream, log) };
}

/**
 * The items of a stream, with the error policy for the error that ends it. A kept error goes on
 * unchanged. Another error goes on as an error of its exposed code and message.
 */
function exposedStream<T>(policy: ServerErrorPolicy, request: ServerRequest<unknown>, items: AsyncIterable<T>, log: HiddenErrorLog): AsyncGenerator<T, void, undefined> {
  const exposed = (async function* () {
    try {
      yield* items;
    } catch (error) {
      const decision = decide(policy, error, errorCodeOf(error), callOf(request), (mapError) => logOnce(log, mapError, request));
      if (decision.kind === "keep") throw error;
      if (decision.kind === "hide") {
        logOnce(log, error, request);
        // The real retryable flag of the error goes on. A last-resort catch that gets this error
        // does not log it again.
        const hidden = new ServerError(HIDDEN_ERROR_MESSAGE, "INTERNAL_ERROR", (error as { retryable?: unknown } | null)?.retryable === true);
        markLogged(hidden);
        throw hidden;
      }
      // Without a flag, the face gives the flag of the code (before the first item) or false
      throw errorOfResult(decision.error);
    }
  })();
  return closableUnread(exposed, items);
}

/** The error that a last-resort catch sends without a policy: `INTERNAL_ERROR` with the message of the error. */
function rawErrorOf(error: unknown): ExposedError {
  return { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message || "Internal server error" : String(error), retryable: false };
}

/**
 * The error that a last-resort catch sends under a policy: when `handle()` throws, or when a face
 * fails after it. `raw` is the error that the face sends without a policy. `map` runs first. Under
 * `"coded"`, the code of `raw` decides, so `INTERNAL_ERROR` gives `"internal error"`, and the
 * logger gets the real error one time.
 */
export function exposeError(policy: ServerErrorPolicy | undefined, error: unknown, call: ErrorCall, log: (error: unknown) => void, raw: ExposedError = rawErrorOf(error)): ExposedError {
  if (!policyActs(policy)) return raw;
  const once: HiddenErrorLog = (logged) => log(logged);
  const decision = decide(policy, error, raw.code, call, (mapError) => logOnce(once, mapError, undefined));
  if (decision.kind === "keep") return raw;
  if (decision.kind === "replace") return decision.error;
  logOnce(once, error, undefined);
  return { code: "INTERNAL_ERROR", message: HIDDEN_ERROR_MESSAGE, retryable: raw.retryable === true };
}

/**
 * The error that the last-resort catch of a face sends: the error policy of the handler
 * (`RequestHandler.exposeError`, which `Server` has), or `raw` for a handler without one. `raw`
 * is the error that the face sends without a policy.
 */
export function lastResortError(handler: RequestHandler, error: unknown, request: ServerRequest<unknown> | undefined, raw: ExposedError = rawErrorOf(error)): ExposedError {
  return handler.exposeError ? handler.exposeError(error, request, raw) : raw;
}
