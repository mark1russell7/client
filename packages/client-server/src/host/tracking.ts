/**
 * The request tracking of the procedures host (decisions D3 and D4, CLI-7).
 *
 * Each call of a face goes through `life.request` of the service. Thus the service admits the
 * call, counts it, drains it and cuts it, as it does for each request of a process.
 *
 * - The route of a call is the name of its face and the key of its procedure: `http git.status`.
 *   One route pattern for each face (`http *`) matches each call, also of a procedure that the
 *   registry gets later.
 * - A function of the pattern gives the operation of each call, thus its idempotency (D3): a
 *   repeatable procedure, a call with an idempotency key, or a call that runs one time.
 * - Each call is a stream (D4). A unary call is a stream of one. A stream call stays in flight
 *   until its last item, and a cut after the first item ends the stream in-band, with an error.
 */

import type { IncomingMessage, ServerResponse as NodeResponse } from "node:http";
import type { Lifecycle, Operation, OperationOf, RequestEnd, RequestEvent, RouteRequest } from "@mark1russell7/service";
import {
  IDEMPOTENCY_KEY_METADATA,
  effectsOf,
  idempotencyKeyOf,
  isRepeatable,
  methodToPath,
  ms,
  pathToKey,
  type ProcedureRegistry,
  type ProcedureServer,
  type RequestHandler,
  type ServerRequest,
  type ServerResponse,
} from "@procedures/client";

/**
 * The operation of a call, which gives its idempotency (D3):
 * - `repeatable`: the effects of the procedure permit a second run (no writes, or idempotent writes).
 * - `keyed`: the call has an idempotency key, and the server keeps its result for the window.
 * - `once`: each other call. A cut of it before its first item answers 500, because it can have had its effect.
 */
export type CallOperation = "repeatable" | "keyed" | "once";

/** The detail of a call for the function of a route pattern: its face, its procedure and its operation. */
export interface CallDetail {
  readonly face: string;
  /** The key of the procedure, for example `git.status`. */
  readonly key: string;
  readonly operation: CallOperation;
}

/**
 * This function gives the operations that a call of a face can be, by name. With a window, a call
 * with an idempotency key is a keyed operation for that window (the time that the server keeps a result).
 */
export function callOperations(keyedWindowMs: number | undefined): Readonly<Record<string, Operation>> {
  return {
    repeatable: { idempotent: true },
    once: { idempotent: false },
    ...(keyedWindowMs !== undefined ? { keyed: { idempotent: { key: IDEMPOTENCY_KEY_METADATA, window: ms(keyedWindowMs) } } } : {}),
  };
}

/** This function is the operation function of each pattern of the host: it reads the operation from the detail of the call. */
export const operationOfCall: OperationOf = (request: RouteRequest): string => (request.detail as CallDetail | undefined)?.operation ?? "once";

/** A handler of one face: the server of the host, with each call through the request tracking of the service. */
export interface FaceHandler extends RequestHandler {
  /** This method gives the registry of the server. The MCP face lists its tools from it. */
  getRegistry(): ProcedureRegistry;
}

/** The options of `faceHandler()`. */
export interface FaceHandlerOptions {
  readonly server: ProcedureServer;
  /** The controller of the calls in the declaration of the service. */
  readonly controller: string;
  /** The name of the face: the first part of the route of each call. */
  readonly face: string;
  /** This function gives the lifecycle of the service, or null. Without a lifecycle, each call goes to the server directly. */
  readonly life: () => Lifecycle | null;
  /** True: a call with an idempotency key is a keyed operation. The server then keeps the results of the keys. */
  readonly keyed: boolean;
}

/** A part of the stream of a call: the head of the response first, then each item of a stream. */
type Part = { readonly head: ServerResponse; readonly streams: boolean } | { readonly value: unknown };

/** The response of an error, in wire v1. */
function failure(id: string, code: string, message: string, retryable: boolean): ServerResponse {
  return { id, status: { type: "error", code, message, retryable }, metadata: {} };
}

/** The text of an error. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The response of an end before the first item. A refusal and a retryable cut are `UNAVAILABLE`
 * (503, with `Retry-After` from the transport). Another cut and a failure are `INTERNAL_ERROR` (500).
 */
function endResponse(id: string, end: RequestEnd): ServerResponse {
  switch (end.kind) {
    case "refused":
      return failure(id, "UNAVAILABLE", `The host does not take the call now: ${end.cause}`, true);
    case "cut":
      return end.status === 503
        ? failure(id, "UNAVAILABLE", `The host stopped the call: ${end.cause}`, true)
        : failure(id, "INTERNAL_ERROR", `The host stopped the call, and the call can have had its effect: ${end.cause}`, false);
    case "failed":
      return failure(id, "INTERNAL_ERROR", messageOf(end.error), false);
    case "done":
      return failure(id, "INTERNAL_ERROR", "The call ended without a response", false);
  }
}

/**
 * The error of an end after the first item: the stream ends in-band, with an error line. The count
 * of the items of the stream goes in the message. The head of the response is not an item.
 */
function inBandEnd(end: Extract<RequestEnd, { kind: "refused" | "cut" }>): Error {
  const delivered = Math.max(0, end.delivered - 1);
  return Object.assign(new Error(`The host stopped the stream after ${delivered} items: ${end.cause}`), {
    code: end.retryable ? "UNAVAILABLE" : "INTERNAL_ERROR",
    retryable: end.retryable,
    delivered,
  });
}

/** The items of a stream call after its head. The reader that stops early stops the call. */
async function* streamRest(events: AsyncIterator<RequestEvent<Part>>): AsyncGenerator<unknown, void, undefined> {
  let ended = false;
  try {
    for (;;) {
      const next = await events.next();
      if (next.done) {
        ended = true;
        return;
      }
      const event = next.value;
      if (event.kind === "item") {
        if ("value" in event.value) yield event.value.value;
        continue;
      }
      ended = true;
      if (event.kind === "done") return;
      if (event.kind === "failed") throw event.error;
      throw inBandEnd(event);
    }
  } finally {
    if (!ended) await events.return?.(undefined);
  }
}

/** This function does one call through `life.request`, and gives the response of the face. */
async function trackedCall(life: Lifecycle, options: FaceHandlerOptions, request: ServerRequest): Promise<ServerResponse> {
  const { server } = options;
  const key = pathToKey(methodToPath(request.method));
  const procedure = server.procedureOf(request.method);
  const operation: CallOperation =
    procedure !== undefined && isRepeatable(effectsOf(procedure))
      ? "repeatable"
      : options.keyed && idempotencyKeyOf(request.metadata) !== undefined
        ? "keyed"
        : "once";
  const detail: CallDetail = { face: options.face, key, operation };
  const outer = request.signal;

  // The work of the request: the head of the response, then each item of a stream
  const work = async function* (signal: AbortSignal): AsyncGenerator<Part, void, undefined> {
    request.signal = outer ? AbortSignal.any([outer, signal]) : signal;
    const response = await server.handle(request);
    const items = response.stream;
    if (items === undefined) {
      yield { head: response, streams: false };
      return;
    }
    const { stream: _items, ...head } = response;
    yield { head, streams: true };
    for await (const value of items) yield { value };
  };

  let events: AsyncIterator<RequestEvent<Part>>;
  try {
    events = life.request<Part>(options.controller, `${options.face} ${key}`, (signal) => work(signal), { detail })[Symbol.asyncIterator]();
  } catch (error) {
    return failure(request.id, "INTERNAL_ERROR", `The service of the host has no route for this call: ${messageOf(error)}`, false);
  }
  const first = await events.next();
  if (first.done) return failure(request.id, "INTERNAL_ERROR", "The call ended without a response", false);
  const event = first.value;
  if (event.kind !== "item") return endResponse(request.id, event);
  const part = event.value;
  if (!("head" in part)) {
    await events.return?.(undefined);
    return failure(request.id, "INTERNAL_ERROR", "The call gave an item before its response", false);
  }
  if (!part.streams) {
    // The end of a unary call: the call leaves the count of the service
    await events.next();
    return part.head;
  }
  return { ...part.head, stream: streamRest(events) };
}

/**
 * This function gives the handler of one face. While the host runs under a service, each call
 * goes through `life.request`. Without a service, each call goes to the server directly.
 */
export function faceHandler(options: FaceHandlerOptions): FaceHandler {
  const { server } = options;
  return {
    ambientCredentials: server.ambientCredentials,
    getRegistry: () => server.getRegistry(),
    handle: (request: ServerRequest): Promise<ServerResponse> => {
      const life = options.life();
      return life ? trackedCall(life, options, request) : server.handle(request);
    },
  };
}

/**
 * The request tracking of a face whose requests are not procedure calls, for example the auth
 * routes of an app (CLI-54). The function does the work of one HTTP request through `life.request`,
 * on the route `<face> <key>` of the controller of the host. Thus the request gets the readiness
 * of the controller, the refusal after the stop of the intake, and the drain.
 *
 * - `serve` writes the response. The request stays in flight until the response closes.
 * - The operation of the request gives its idempotency. The default: `repeatable` for `GET` and
 *   `HEAD`, `once` for another method.
 * - A refusal, a cut before the response starts and an error get a JSON error of wire v1:
 *   `UNAVAILABLE` (503, retryable) or `INTERNAL_ERROR` (500).
 * - Without a service, `serve` starts at once.
 */
export type HttpTracker = (
  req: IncomingMessage,
  res: NodeResponse,
  key: string,
  serve: (signal: AbortSignal) => Promise<void> | void,
  operation?: CallOperation,
) => Promise<void>;

/** The options of `httpTracker()`. */
export interface HttpTrackerOptions {
  /** The controller of the calls in the declaration of the service. */
  readonly controller: string;
  /** The name of the face: the first part of the route of each request. */
  readonly face: string;
  /** This function gives the lifecycle of the service, or null. Without a lifecycle, each request starts directly. */
  readonly life: () => Lifecycle | null;
}

/** This function writes the JSON error of an end of a request, when its response did not start. */
function writeEnd(res: NodeResponse, end: RequestEnd): void {
  if (end.kind === "done") return;
  if (res.headersSent || res.writableEnded) {
    // The response started: only a close of the connection tells the caller
    if (!res.writableEnded) res.destroy();
    return;
  }
  const { status } = endResponse("", end);
  if (status.type !== "error") return;
  res.statusCode = status.code === "UNAVAILABLE" ? 503 : 500;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: status.message, code: status.code, retryable: status.retryable }));
}

/** This function gives the request tracking of one face (CLI-54). */
export function httpTracker(options: HttpTrackerOptions): HttpTracker {
  return async (req, res, key, serve, operation) => {
    // The work ends when the response closes: a handler can end before its body is out
    const work = (signal: AbortSignal): Promise<true> =>
      new Promise<true>((resolve, reject) => {
        if (res.writableFinished || res.destroyed) {
          resolve(true);
          return;
        }
        res.once("close", () => resolve(true));
        Promise.resolve()
          .then(() => serve(signal))
          .catch(reject);
      });
    const life = options.life();
    if (!life) {
      try {
        await work(new AbortController().signal);
      } catch (error) {
        writeEnd(res, { kind: "failed", error, delivered: 0 });
      }
      return;
    }
    const method = (req.method ?? "GET").toUpperCase();
    const detail: CallDetail = { face: options.face, key, operation: operation ?? (method === "GET" || method === "HEAD" ? "repeatable" : "once") };
    let end: RequestEnd;
    try {
      end = (await life.request<true>(options.controller, `${options.face} ${key}`, work, { detail }).collect()).end;
    } catch (error) {
      end = { kind: "failed", error: new Error(`The service of the host has no route for this request: ${messageOf(error)}`), delivered: 0 };
    }
    writeEnd(res, end);
  };
}
