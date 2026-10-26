/**
 * The error policy of a server (roadmap CLI-80): what an error tells the caller when it leaves
 * the process.
 *
 * `Server.handle()` applies the policy to each response, so each face of the server (HTTP,
 * WebSocket, MCP, a message port, the local face of a host) sends the same error. A nested call
 * of `ctx.client` does not go through `handle()`, so it keeps the real error.
 *
 * - `expose: "all"` (the default): each error goes to the caller as before.
 * - `expose: "coded"`: an error with a known code (`isKnownErrorCode`) goes to the caller as it
 *   is. Each other error goes to the caller as `INTERNAL_ERROR` with the message
 *   `"internal error"`, and the server logs it.
 * - `map` runs first. Its result goes to the caller as it is. `undefined` gives the error to
 *   `expose`.
 */

import type { ProcedurePath } from "../procedures/types.js";
import { closableUnread } from "../procedures/invoke.js";
import { isKnownErrorCode } from "../client/errors/registry.js";
import { errorCodeOf } from "../protocol.js";
import { methodToPath } from "./method.js";
import { ServerError, type ServerRequest, type ServerResponse } from "./types.js";

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
}

/** The call of an error that leaves the server. */
export interface ErrorCall {
  /** The path of the procedure. */
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
   *   `VALIDATION_ERROR`, `CONFLICT` and so on), with its code, its message, its retryable flag
   *   and its metadata. Each other error goes to the caller as `INTERNAL_ERROR` with the message
   *   `"internal error"`, not retryable and without metadata. The codes `INTERNAL_ERROR`,
   *   `HANDLER_ERROR` and `UNKNOWN` tell of a failure, not of a refusal, so their message is
   *   hidden too. The server gives the real error to its `onError` logger, or to `console.error`
   *   without a logger.
   */
  readonly expose?: "all" | "coded" | undefined;
  /**
   * This function runs first, for each error that leaves the server. Its result goes to the
   * caller as it is, also with a code of the application. `undefined` gives the error to
   * `expose`. A function that throws gives `INTERNAL_ERROR`.
   */
  readonly map?: ((error: unknown, call: ErrorCall) => ExposedError | undefined) | undefined;
}

/** The message of a hidden error. */
export const HIDDEN_ERROR_MESSAGE = "internal error";

/** The codes that tell of a failure, not of a refusal: `"coded"` hides their message. */
const FAILURE_CODES: ReadonlySet<string> = new Set(["INTERNAL_ERROR", "HANDLER_ERROR", "UNKNOWN"]);

/**
 * The real error of each error status that the server made from an error. The key is the status
 * object: a copy of a response (`{ ...response, id }`) keeps it, and the wire never sees it.
 */
const ERRORS_OF_STATUSES = new WeakMap<object, unknown>();

/**
 * This function records the real error of an error response, for the error policy. The response
 * does not change.
 *
 * @internal
 */
export function withRealError<T extends ServerResponse<unknown>>(response: T, error: unknown): T {
  ERRORS_OF_STATUSES.set(response.status, error);
  return response;
}

/** The logger of the hidden errors: the hook `onError` of the server, or `console.error`. */
export type HiddenErrorLog = (error: unknown, request: ServerRequest<unknown>) => void;

/** True when the policy can change a response: `"coded"`, or a `map` function. */
export function policyActs(policy: ServerErrorPolicy | undefined): policy is ServerErrorPolicy {
  return policy !== undefined && (policy.expose === "coded" || policy.map !== undefined);
}

/** The call of a request, for `map`. */
function callOf(request: ServerRequest<unknown>): ErrorCall {
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
 * `map` result is final. `"coded"` keeps an error with a known code that is not a failure code.
 */
function decide(policy: ServerErrorPolicy, error: unknown, code: string, request: ServerRequest<unknown>, log: HiddenErrorLog): Decision {
  if (policy.map) {
    let mapped: ExposedError | undefined;
    try {
      mapped = policy.map(error, callOf(request));
    } catch (mapError) {
      log(mapError, request);
      return { kind: "hide" };
    }
    if (mapped !== undefined) return { kind: "replace", error: mapped };
  }
  if (policy.expose !== "coded") return { kind: "keep" };
  if (isKnownErrorCode(code) && !FAILURE_CODES.has(code)) return { kind: "keep" };
  return { kind: "hide" };
}

/**
 * This function applies the error policy to a response that leaves the server: to an error
 * status, and to the error that ends a stream. `logged` is true when the server gave the error to
 * its logger already.
 *
 * @internal
 */
export function exposedResponse<T>(
  policy: ServerErrorPolicy,
  request: ServerRequest<unknown>,
  response: ServerResponse<T>,
  log: HiddenErrorLog,
  logged = false,
): ServerResponse<T> {
  const status = response.status;
  if (status.type === "error") {
    // A response that the server made without an error (a refusal of the token, a duplicate
    // stream) gives `map` a ServerError of its status
    const real = ERRORS_OF_STATUSES.has(status) ? ERRORS_OF_STATUSES.get(status) : new ServerError(status.message, status.code, status.retryable);
    const decision = decide(policy, real, status.code, request, log);
    if (decision.kind === "keep") return response;
    if (decision.kind === "hide" && !logged) log(real, request);
    const exposed = decision.kind === "replace" ? decision.error : undefined;
    const { stream: _stream, payload: _payload, ...rest } = response;
    return {
      ...rest,
      status: {
        type: "error",
        code: exposed?.code ?? "INTERNAL_ERROR",
        message: exposed?.message ?? HIDDEN_ERROR_MESSAGE,
        retryable: exposed?.retryable ?? false,
      },
      // The metadata of the real error (a reason, a wait, the conflicts) does not go out
      metadata: {},
    };
  }
  if (response.stream === undefined) return response;
  return { ...response, stream: exposedStream(policy, request, response.stream, log) };
}

/**
 * The items of a stream, with the error policy for the error that ends it. A kept error goes on
 * unchanged. Another error goes on as a `ServerError` of its exposed code and message.
 */
function exposedStream<T>(policy: ServerErrorPolicy, request: ServerRequest<unknown>, items: AsyncIterable<T>, log: HiddenErrorLog): AsyncGenerator<T, void, undefined> {
  const exposed = (async function* () {
    try {
      yield* items;
    } catch (error) {
      const decision = decide(policy, error, errorCodeOf(error), request, log);
      if (decision.kind === "keep") throw error;
      if (decision.kind === "hide") {
        log(error, request);
        throw new ServerError(HIDDEN_ERROR_MESSAGE, "INTERNAL_ERROR", false);
      }
      const { code, message, retryable } = decision.error;
      // Without a flag, the face gives the flag of the code (before the first item) or false
      throw Object.assign(new Error(message), { code, ...(retryable !== undefined ? { retryable } : {}) });
    }
  })();
  return closableUnread(exposed, items);
}
