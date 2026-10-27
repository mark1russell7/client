/**
 * The procedure handler of HTTP: a request handler of `node:http`, without a framework (CLI-3).
 *
 * `procedureHandler(server, options)` gives a function `(req, res) => boolean`. The function takes
 * each request whose path is under `basePath` and gives `true`. It gives `false` for each other
 * request and does not touch it, so the routes of the application get it. A mount list of a
 * listener ("first match wins") can hold it next to other handlers. The wire is the wire of
 * `HttpServerTransport` (`documentation/WIRE-PROTOCOL.md`). It has the URL of the method, the JSON
 * body and the NDJSON streams of `writeNdjsonStream` with `seq` and keep-alive lines. It also has
 * the error codes, the idempotency keys, the deadlines, the events and the browser checks.
 *
 * The handler also has the stop parts of a service transport: `start()`, `stopIntake()`,
 * `drain(deadline, signal)`, `inFlight()` and `close()`. The handler does not make a server and
 * does not listen: the owner of the listener does that.
 *
 * This module imports only the types of `node:http`, so it loads no Node code at run time.
 */

import type { IncomingHttpHeaders, IncomingMessage, ServerResponse as NodeResponse } from "node:http";
import type { Metadata, Method } from "../../../client/types.js";
import type { RequestHandler, ServerRequest, ServerResponse } from "../../../server/types.js";
import { lastResortError } from "../../../server/last-resort.js";
import { decodeMetadataHeader, METADATA_HEADER_LIMIT } from "../shared/index.js";
import { ERROR_REGISTRY } from "../../../client/errors/index.js";
import { assertNamedOrigins, checkBrowserRequest, needsNamedOrigin, type BrowserGuardOptions } from "../../../server/browser-guard.js";
import { isUnboundedStream } from "../../../server/stream-metadata.js";
import { headerNames, isSecretHeader, queryRecord, requestCredentials, urlParts, withoutSecretHeaders } from "../../../server/request-auth.js";
import { PROTOCOL_HEADER, PROTOCOL_VERSION, httpStatusOf, protocolVersionOf } from "../../../protocol.js";
import { realClock, type Cancel, type Clock } from "../../../clock.js";
import { ms, type Duration } from "../../../duration.js";
import { NDJSON_MEDIA_TYPE as NDJSON, defaultNdjsonError as errorOf, keepAliveMsOf, writeNdjsonStream } from "./ndjson.js";
import { applyCors, corsOrigins, corsPolicy, type CorsOptions, type CorsPolicy } from "./cors.js";
import { urlAddressing, type Addressing } from "./addressing.js";
import { BodyError, readJsonBody } from "./body.js";
import { BATCH_HEADER, batchFrames, batchOptionsOf, isBatchRequest, parseBatch, type HandlerBatchOptions, type BatchRun } from "./batch.js";
import { NARROWING_METADATA_KEY, addNarrowing } from "../../../procedures/narrowing.js";
import { retryAfterSeconds } from "@mark1russell7/service/limiter";

/** The parts of a request that a URL strategy of `procedureHandler` reads. */
export interface UrlRequest {
  /** The HTTP method, in upper case. */
  readonly method: string;
  /** The path of the URL, without the query. */
  readonly path: string;
  /** The URL of the request line: the path and the query. */
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
  /** The first value of each query parameter. */
  readonly query: Readonly<Record<string, string>>;
}

/**
 * The URL strategy of `procedureHandler`: it gives the method of a request, or null when the URL
 * names no method. The second argument is the request of `node:http`.
 */
export type NodeUrlStrategy = (request: UrlRequest, req: IncomingMessage) => Method | null;

/** The options of `procedureHandler`. */
export interface ProcedureHandlerOptions extends BrowserGuardOptions {
  /**
   * The path under which the handler takes the requests. A request outside it goes on.
   * @default "/api"
   */
  readonly basePath?: string | undefined;
  /**
   * The method of a request. The default reads the URL format of `HttpTransport`:
   * `{basePath}/{service}/{operation}`. The option `addressing` replaces it.
   */
  readonly urlStrategy?: NodeUrlStrategy | undefined;
  /**
   * The addressing of a request (CLI-31): a hook of the request and its body that gives the
   * method and the payload of the call. `bodyPathAddressing()` reads the path from the body of a
   * single endpoint.
   * @default urlAddressing({ basePath, urlStrategy })
   */
  readonly addressing?: Addressing | undefined;
  /**
   * The CORS headers of the requests on the path. `true` uses the defaults: each origin, without
   * credentials. The permitted origins of the browser checks follow the CORS origins. An origin
   * that the CORS does not permit gets no `Access-Control-*` header. With a list or a function of
   * origins, each response gets `Vary: Origin`.
   * @default false
   */
  readonly cors?: boolean | CorsOptions | undefined;
  /**
   * The largest request body, in bytes, when the handler reads the body itself (no body parser
   * of a framework before it).
   * @default 1 MiB
   */
  readonly bodyLimit?: number | undefined;
  /**
   * The quiet time of an NDJSON stream. After it, the handler writes a keep-alive line. `false`,
   * or a duration of zero or less, sends no keep-alive line.
   * @default seconds(15) (`TIMER_DEFAULTS.httpServer.keepAliveMs`)
   */
  readonly keepAlive?: Duration | false | undefined;
  /** The clock of the keep-alive timers and of `drain()`. A test gives a fake clock. */
  readonly clock?: Clock | undefined;
  /**
   * More headers that carry a secret, for example the token header of an application. They go
   * into the credentials of the request, not into its metadata. `Authorization`,
   * `Proxy-Authorization`, `Cookie` and `X-Api-Key` are always secret.
   */
  readonly secretHeaders?: readonly string[] | undefined;
  /**
   * The query parameters that carry a secret. They go into the credentials of the request, not
   * into its metadata.
   * @default ["token"]
   */
  readonly secretQuery?: readonly string[] | undefined;
  /**
   * The batches of calls (roadmap CLI-32): `POST {basePath}` with the header `Procedures-Batch: 1`
   * carries several calls, and the answer is one NDJSON stream of frames that name their call.
   * Each call runs as a call of its own. `false` takes no batch: such a request goes on as before.
   * @default { maxCalls: 64, concurrency: 8 }
   */
  readonly batch?: boolean | HandlerBatchOptions | undefined;
}

/**
 * The request handler of `procedureHandler`. A call gives `true` when the handler takes the request
 * (its path is under `basePath`), and `false` for another request. The handler then does not touch
 * the request.
 */
export interface NodeProcedureHandler {
  (req: IncomingMessage, res: NodeResponse): boolean;
  /**
   * This method handles a request as the call does. Its promise resolves when the response ends:
   * `true` when the handler took the request, `false` for another request.
   */
  handle(req: IncomingMessage, res: NodeResponse): Promise<boolean>;
  /** This method gives true when the handler takes the request: its path is under `basePath`. */
  matches(req: IncomingMessage): boolean;
  /**
   * The handler as a middleware of Connect or Express: a request outside `basePath` goes to `next`.
   */
  middleware(req: IncomingMessage, res: NodeResponse, next: (error?: unknown) => void): void;
  /** The path under which the handler takes the requests. */
  readonly basePath: string;
  /** This method accepts new requests again, after `stopIntake()`. */
  start(): void;
  /** This method refuses each new request with the retryable error `UNAVAILABLE` (503). */
  stopIntake(): void;
  /**
   * This method waits until no request is in progress, until the `deadline` (milliseconds on the
   * clock of the handler), or until the signal aborts.
   */
  drain(deadline: number, signal?: AbortSignal): Promise<void>;
  /** The number of requests in progress, open streams too. */
  inFlight(): number;
  /** This method aborts each request in progress: an open stream ends, and its handler gets `return()`. */
  close(): void;
}

/**
 * The parts of `HttpServerTransport` that are not of the wire v1 handler. The Express shim gives
 * them, so its behavior stays the same. A new mount uses the defaults.
 *
 * @internal
 */
export interface HandlerCompat {
  /**
   * True: the behavior of `HttpServerTransport` before the handler. An `OPTIONS` request goes to
   * the procedures, and the query parameter `token` stays in the metadata. The error codes are the
   * codes of wire v1, as for a new mount (CLI-4).
   */
  readonly legacy?: boolean | undefined;
  /** The method of a request: the URL strategy of Express. */
  readonly methodOf?: ((req: IncomingMessage) => Method | null) | undefined;
  /** The JSON response of the framework (`res.status(status).json(body)` of Express). */
  readonly sendJson?: ((res: NodeResponse, status: number, body: unknown) => void) | undefined;
  /** True: the shim applies CORS to each request of its app, so the handler does not. */
  readonly corsOutside?: boolean | undefined;
  /** True: the framework matched the path already, so the handler takes each request that it gets. */
  readonly matchAll?: boolean | undefined;
  /** The name of the face and of its CORS origin option, for the error of `assertNamedOrigins`. */
  readonly face?: { readonly name: string; readonly originOption: string } | undefined;
}

/** The metadata keys that the transport sets: a query parameter or a header cannot replace them. */
const RESERVED_METADATA = new Set(["headers", "query", "params"]);

/** The headers that do not go to the root of the metadata. The client sends them as such. */
const STANDARD_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "content-type",
  "user-agent",
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "origin",
  "referer",
  "x-request-id",
  "x-trace-id",
  "x-span-id",
  "x-parent-span-id",
  "x-timeout",
  "x-api-key",
  "authorization",
  "x-metadata",
]);

/** The known custom headers whose metadata key is not the header name (lower case to camel case). */
/**
 * The headers that a call of a batch cannot give (CLI-32): the headers of the connection, of the
 * body, of the browser and of the protocol stay the headers of the HTTP request.
 */
const REQUEST_ONLY_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "content-type",
  "transfer-encoding",
  "accept",
  "accept-encoding",
  "origin",
  "referer",
  "x-metadata",
  "procedures-protocol",
  "procedures-batch",
]);

const HEADER_MAPPINGS: Record<string, string> ={ collectionname: "collectionName" };

/** This function sets a key as an own property, also the key `__proto__` (the `put` of the query language). */
function put(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * This function sets a key at the root of the metadata. Each source of the narrowing key adds to
 * the key, so no source replaces another (CLI-30).
 */
function setMetadata(metadata: Metadata, key: string, value: unknown): void {
  metadata[key] = key === NARROWING_METADATA_KEY ? addNarrowing(metadata[key], value) : value;
}

/** This function writes a JSON response without a framework. */
function writeJson(res: NodeResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(text));
  res.end(text);
}

/** The path of a request without a framework: the path of `req.url`, without the query. */
function pathOf(req: IncomingMessage): string {
  return urlParts(req.url).path;
}

/** The query that a framework parsed (`req.query` of Express), or the query of the URL. */
function queryOf(req: IncomingMessage): Record<string, unknown> {
  const parsed = (req as { query?: unknown }).query;
  if (parsed !== null && typeof parsed === "object") return parsed as Record<string, unknown>;
  const { query } = urlParts(req.url);
  const out = new Map<string, string | string[]>();
  for (const key of new Set(query.keys())) {
    const values = query.getAll(key);
    out.set(key, values.length === 1 ? values[0]! : values);
  }
  return Object.fromEntries(out);
}

/** The route parameters that a framework parsed (`req.params` of Express), or none. */
function paramsOf(req: IncomingMessage): Record<string, string> {
  const parsed = (req as { params?: unknown }).params;
  return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
}

/**
 * This function makes a procedure handler: a request handler of `node:http` that serves the
 * procedures of `server` under `options.basePath`, with wire protocol v1.
 *
 * @example
 * ```typescript
 * const server = new ProcedureServer({ registry, token });
 * const procedures = procedureHandler(server, { basePath: "/api/proc" });
 * createServer((req, res) => {
 *   if (procedures(req, res)) return;
 *   appRoutes(req, res); // for example /api/chat
 * }).listen(4820);
 * ```
 */
export function procedureHandler(server: RequestHandler, options: ProcedureHandlerOptions = {}): NodeProcedureHandler {
  return createProcedureHandler(server, options);
}

/**
 * This function makes the procedure handler with the parts of a compatibility shim.
 *
 * @internal
 */
export function createProcedureHandler(server: RequestHandler, options: ProcedureHandlerOptions, compat: HandlerCompat = {}): NodeProcedureHandler {
  const legacy = compat.legacy === true;
  const basePath = options.basePath ?? "/api";
  const prefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const bodyLimit = options.bodyLimit ?? 1024 * 1024;
  // A value that is not a duration fails here, not at the first stream
  const keepAliveMs = keepAliveMsOf(options.keepAlive);
  const keepAlive: Duration | false = keepAliveMs > 0 ? ms(keepAliveMs) : false;
  const clock = options.clock ?? realClock;
  const corsOptions: CorsOptions | undefined = options.cors === true ? {} : options.cors === false ? undefined : options.cors;
  // A list of origins or a function: the default sends the credentials. "*" with credentials is invalid.
  // An origin that is not permitted gets no CORS header, and each response still varies by the origin (CLI-56)
  const cors: CorsPolicy | undefined =
    corsOptions === undefined || compat.corsOutside ? undefined : { ...corsPolicy(corsOptions, (corsOptions.origin ?? "*") !== "*"), permittedOnly: true };
  const guard: BrowserGuardOptions = {
    allowedOrigins: options.allowedOrigins ?? corsOrigins(corsOptions),
    allowedHosts: options.allowedHosts,
    allowGet: options.allowGet,
  };
  // CSRF: a server that reads the cookies of each request needs named origins (CLI-2a)
  const ambientMode = server.ambientCredentials;
  assertNamedOrigins(compat.face?.name ?? "procedureHandler", ambientMode, guard.allowedOrigins, compat.face?.originOption ?? "cors.origin");
  const secretHeaders = headerNames(options.secretHeaders);
  const secretQuery = new Set(options.secretQuery ?? (legacy ? [] : ["token"]));
  const batch = batchOptionsOf(options.batch);
  // The addressing of a request (CLI-31): the option, or the URL strategy of the shim, or the URL
  // format of HttpTransport
  const compatMethodOf = compat.methodOf;
  const addressing: Addressing =
    options.addressing ??
    urlAddressing(compatMethodOf ? { urlStrategy: (_view, req) => compatMethodOf(req) } : { basePath, urlStrategy: options.urlStrategy });
  // A single endpoint (the path in the body) is the base path itself
  const bareBase = prefix.slice(0, -1);
  const sendJson = compat.sendJson ?? writeJson;

  /** The controllers of the requests in progress: close() aborts them (deep dive TRN-15) */
  const openRequests = new Set<AbortController>();
  /** The functions that drain() waits on: each one runs when no request is in progress */
  let idleWaiters: Array<() => void> = [];
  let stopped = false;

  const requestEnded = (controller: AbortController): void => {
    if (!openRequests.delete(controller) || openRequests.size > 0) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const waiter of waiters) waiter();
  };

  const matches = (req: IncomingMessage): boolean => {
    if (compat.matchAll === true) return true;
    const path = pathOf(req);
    return path.startsWith(prefix) || (path === bareBase && (addressing.takesBasePath === true || (batch !== undefined && isBatchRequest(req))));
  };

  /** True when the request is a batch at the base path (CLI-32). */
  const isBatch = (req: IncomingMessage): boolean => {
    if (batch === undefined || !isBatchRequest(req)) return false;
    const path = pathOf(req);
    return compat.matchAll === true || path === bareBase || path === prefix;
  };

  /** The error body of wire v1: the message, the code, the retryable flag and the more fields. */
  const sendError = (res: NodeResponse, status: number, message: string, code: string, retryable = false, more: Record<string, unknown> = {}): void => {
    sendJson(res, status, { error: message, code, retryable, ...more });
  };

  /**
   * The request body. A body parser of a framework (`express.json({ strict: false })`) gives
   * `req.body`. Without one, the handler reads the JSON body itself (deep dive TRN-10).
   */
  const readBody = (req: IncomingMessage): Promise<unknown> => readJsonBody(req, bodyLimit);

  /**
   * This function converts an HTTP request to a `ServerRequest`, or gives null when the addressing
   * finds no call in the request.
   */
  const toServerRequest = (req: IncomingMessage, body: unknown): ServerRequest | null => {
    const { path, query: urlQuery } = urlParts(req.url);
    const view: UrlRequest = { method: (req.method ?? "GET").toUpperCase(), path, url: req.url ?? "/", headers: req.headers, query: queryRecord(urlQuery) };
    const address = addressing(view, body, req);
    if (!address) return null;
    const id = (req.headers["x-request-id"] as string | undefined) ?? `req-${Date.now()}-${Math.random()}`;
    const narrowing = req.headersDistinct?.[NARROWING_METADATA_KEY] ?? req.headers[NARROWING_METADATA_KEY];
    return requestOf(req, { id, method: address.method, payload: address.payload, headers: req.headers, narrowing: [narrowing].flat(), custom: customOf(req.headers) });
  };

  /**
   * The custom metadata of the `X-Metadata` header (deep dive TRN-11): any JSON value, any key.
   * A header above the limit or a header that is not URI-encoded JSON throws a `BodyError`.
   */
  const customOf = (headers: IncomingHttpHeaders): Record<string, unknown>[] => {
    const encoded = headers["x-metadata"];
    if (typeof encoded !== "string") return [];
    if (encoded.length > METADATA_HEADER_LIMIT) {
      throw new BodyError(`The X-Metadata header is longer than ${METADATA_HEADER_LIMIT} characters`, 431);
    }
    const custom = decodeMetadataHeader(encoded);
    if (!custom) throw new BodyError("The X-Metadata header is not URI-encoded JSON of an object", 400);
    return [custom];
  };

  /**
   * The `ServerRequest` of one call. A request of one call gives the headers of the HTTP request.
   * A call of a batch gives the headers of the HTTP request with the headers of the call over
   * them (CLI-32). The credentials always come from the HTTP request.
   */
  const requestOf = (
    req: IncomingMessage,
    call: {
      readonly id: string;
      readonly method: Method;
      readonly payload: unknown;
      readonly headers: IncomingHttpHeaders;
      /** Each value of the narrowing header: each one is a source (CLI-30) */
      readonly narrowing: readonly unknown[];
      /** The custom metadata, in order: a later object replaces a key of an earlier one */
      readonly custom: readonly Record<string, unknown>[];
    }
  ): ServerRequest => {
    const { id, method, headers } = call;

    // The query without its secret parameters: they go into the credentials (CLI-2a)
    // An own property for each key, also `__proto__`: a key of the request changes no prototype
    const query: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(queryOf(req))) if (!secretQuery.has(key)) put(query, key, value);
    const params = paramsOf(req);

    // The metadata of the headers and of the query. The query parameters cannot replace headers,
    // query or params. The secret headers go into the credentials, not into the metadata, so a
    // handler and a nested call do not see them (roadmap R18)
    const metadata: Metadata = {
      headers: withoutSecretHeaders(headers as Record<string, unknown>, secretHeaders),
      query,
      params,
    };
    for (const [key, value] of Object.entries(query)) {
      if (!RESERVED_METADATA.has(key) && !key.startsWith("__")) setMetadata(metadata, key, value);
    }

    // The custom headers at the root of the metadata, as the client's metadataToHeaders() sends
    // them. A secret header (Cookie too) does not go there.
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (STANDARD_HEADERS.has(lower) || isSecretHeader(lower, secretHeaders) || typeof value !== "string" || lower === NARROWING_METADATA_KEY) continue;
      const normalizedKey = HEADER_MAPPINGS[lower] ?? key;
      if (!RESERVED_METADATA.has(normalizedKey) && !normalizedKey.startsWith("__")) metadata[normalizedKey] = value;
    }
    // Each value of the narrowing header is one source, also each line of a repeated header. No
    // source replaces another: a gateway's header and the client's key of X-Metadata both apply (CLI-30)
    for (const value of call.narrowing) if (typeof value === "string") setMetadata(metadata, NARROWING_METADATA_KEY, value);

    // The custom metadata of the HTTP client: any JSON value, any key (deep dive TRN-11)
    for (const custom of call.custom) {
      for (const [key, value] of Object.entries(custom)) {
        if (!RESERVED_METADATA.has(key) && key !== "auth" && !key.startsWith("__")) setMetadata(metadata, key, value);
      }
    }

    // The payload of the addressing (the body, or the id of a RESTful GET). Only an absent payload
    // becomes {}: 0, false, "" and null stay (deep dive TRN-10)
    const payload: unknown = call.payload === undefined ? {} : call.payload;

    return {
      id,
      method,
      payload,
      metadata,
      // The face of the request, for the error policy of the server (CLI-80)
      transport: "http",
      // A network request: ProcedureServer examines the token and the request hook (R18, CLI-2a).
      // The credentials have the connection of the socket of the request (CLI-71)
      credentials: requestCredentials({ headers: req.headers as Record<string, unknown>, url: req.url, socket: req.socket }),
    };
  };

  /**
   * The runs of a batch (CLI-32). A bad body or a bad `X-Metadata` header throws a `BodyError`, and
   * then no call runs. A header of a call cannot be a secret header, a header of the connection or
   * a header of the body: the credentials and the body are the parts of the HTTP request.
   */
  const batchRuns = (req: IncomingMessage, body: unknown, signal: AbortSignal): BatchRun[] => {
    const calls = parseBatch(body, batch!.maxCalls);
    const outerCustom = customOf(req.headers);
    const outerNarrowing = [req.headersDistinct?.[NARROWING_METADATA_KEY] ?? req.headers[NARROWING_METADATA_KEY]].flat();
    const batchId = (req.headers["x-request-id"] as string | undefined) ?? `batch-${Date.now()}-${Math.random()}`;
    return calls.map((call) => {
      const headers: IncomingHttpHeaders = {};
      for (const [key, value] of Object.entries(req.headers)) put(headers, key, value);
      const narrowing = [...outerNarrowing];
      for (const [key, value] of Object.entries(call.headers)) {
        const lower = key.toLowerCase();
        if (lower === NARROWING_METADATA_KEY) narrowing.push(value);
        else if (!REQUEST_ONLY_HEADERS.has(lower) && !lower.startsWith("sec-") && !isSecretHeader(lower, secretHeaders)) put(headers, lower, value);
      }
      const custom = call.metadata ? [...outerCustom, call.metadata] : outerCustom;
      const request = requestOf(req, { id: `${batchId}:${call.id}`, method: call.method, payload: call.input, headers, narrowing, custom });
      request.signal = signal;
      return { call: call.id, request };
    });
  };

  /** This function converts a `ServerResponse` to the HTTP response. */
  const toHttp = (serverResponse: ServerResponse, res: NodeResponse): void => {
    const { status, payload, metadata } = serverResponse;

    // A symbolic code maps to its HTTP status: the protocol list, then the error registry
    // (BUGS-2026-07 M7). A number is the status.
    let httpStatusCode: number;
    if (typeof status.code === "string") {
      const mapped = httpStatusOf(status.code) ?? (ERROR_REGISTRY as Record<string, { httpStatus?: number }>)[status.code]?.httpStatus;
      httpStatusCode = mapped ?? (status.type === "success" ? 200 : 500);
    } else if (typeof status.code === "number") {
      httpStatusCode = status.code;
    } else {
      httpStatusCode = status.type === "success" ? 200 : 500;
    }
    // An error with retryable false does not get 503, because a 503 invites a retry at the HTTP
    // level. It gets 500. An example is UNAVAILABLE for a call that the shutdown cut after it can
    // have had its effect (CLI-48, decision D3).
    if (status.type === "error" && httpStatusCode === 503 && status.retryable === false) httpStatusCode = 500;

    if (metadata["headers"]) {
      for (const [key, value] of Object.entries(metadata["headers"])) res.setHeader(key, value as string);
    }

    if (status.type === "success") {
      // No result: 204 with no body (deep dive TRN-10)
      if (payload === undefined) {
        res.statusCode = 204;
        res.end();
        return;
      }
      sendJson(res, httpStatusCode, payload);
      return;
    }
    // The wait that the error asks for: a Retry-After header in whole seconds, rounded up, and the
    // exact milliseconds in the body (R12). The rounding is the rule of the service, so a wait over a
    // whole second by an error of floating point does not add a second (CLI-40).
    const retryAfterMs = metadata["retry-after"];
    const hasRetryAfter = typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0;
    if (hasRetryAfter) res.setHeader("Retry-After", String(retryAfterSeconds({ value: retryAfterMs, unit: "ms" })));
    // The reason of a FORBIDDEN error travels on each face (roadmap R25)
    const reason = typeof metadata["reason"] === "string" ? metadata["reason"] : undefined;
    // The current items of a VERSION_CONFLICT error (roadmap CLI-16)
    const conflicts = Array.isArray(metadata["conflicts"]) ? metadata["conflicts"] : undefined;
    sendJson(res, httpStatusCode, {
      error: status.message,
      code: status.code,
      retryable: status.retryable,
      ...(hasRetryAfter ? { retryAfterMs } : {}),
      ...(reason !== undefined ? { reason } : {}),
      ...(conflicts !== undefined ? { conflicts } : {}),
    });
  };

  /**
   * This function sends a stream response. A client that accepts NDJSON gets the lines of
   * `writeNdjsonStream`. Another client gets the last item as plain JSON, the "sponge" mode, and a
   * stream without an end gets `NOT_ACCEPTABLE` (roadmap R15).
   */
  const streamToHttp = async (response: ServerResponse, stream: AsyncIterable<unknown>, req: IncomingMessage, res: NodeResponse, signal: AbortSignal): Promise<void> => {
    const ndjson = String(req.headers.accept ?? "").includes(NDJSON);

    if (!ndjson && isUnboundedStream(response)) {
      void Promise.resolve(stream[Symbol.asyncIterator]().return?.()).catch(() => undefined);
      const message = `This procedure gives a stream that can run without an end. Send "Accept: ${NDJSON}" to read its items.`;
      toHttp({ id: response.id, status: { type: "error", code: "NOT_ACCEPTABLE", message, retryable: false }, metadata: {} }, res);
      return;
    }

    if (!ndjson) {
      let last: { value: unknown } | undefined;
      // The count of the items of the stream: an error before the first item gets the flag of its
      // code, and an error after it gets false without a flag of its own (CLI-68)
      let items = 0;
      try {
        for await (const item of stream) {
          items++;
          last = { value: item };
        }
      } catch (error) {
        toHttp({ id: response.id, status: { type: "error", ...errorOf(error, items) }, metadata: {} }, res);
        return;
      }
      if (!last) {
        toHttp({ id: response.id, status: { type: "error", code: "NO_OUTPUT", message: "The procedure gave no output", retryable: false }, metadata: {} }, res);
        return;
      }
      toHttp({ id: response.id, status: response.status, metadata: response.metadata, payload: last.value }, res);
      return;
    }

    // The lines, the backpressure, the keep-alive and the abort of close() (WIRE-PROTOCOL.md)
    await writeNdjsonStream(res, stream, { signal, keepAlive, errorOf, clock });
  };

  /**
   * The last resort: an error of `handle()` or of this face after it. The error policy of the
   * server applies here too (CLI-80), and the code of its result gives the HTTP status.
   */
  const sendLastResort = (res: NodeResponse, error: unknown, request: ServerRequest | undefined, message: string): void => {
    const exposed = lastResortError(server, error, request, { code: "INTERNAL_ERROR", message, retryable: false });
    // The wait of a map result (retryAfterMs) goes out as on the usual error path (CLI-80)
    const wait = exposed.retryAfterMs;
    const metadata = typeof wait === "number" && Number.isFinite(wait) && wait >= 0 ? { "retry-after": wait } : {};
    toHttp({ id: request?.id ?? "unknown", status: { type: "error", code: exposed.code, message: exposed.message, retryable: exposed.retryable === true }, metadata }, res);
  };

  /** This function serves a request that the handler took. */
  const serve = async (req: IncomingMessage, res: NodeResponse): Promise<void> => {
    if (cors && applyCors(req, res, cors)) return;
    // The protocol version of this server, on each response (roadmap R25)
    res.setHeader(PROTOCOL_HEADER, String(PROTOCOL_VERSION));
    // A server that takes batches says so on each answer to a batch, also on an error. A client
    // sends the calls of a batch alone after an answer without it (CLI-32).
    if (isBatch(req)) res.setHeader(BATCH_HEADER, "1");
    const version = protocolVersionOf(req.headers[PROTOCOL_HEADER.toLowerCase()]);
    if (version !== undefined && version > PROTOCOL_VERSION) {
      sendJson(res, 400, {
        error: `This server speaks the protocol ${PROTOCOL_VERSION}, and the request uses ${version}`,
        code: "PROTOCOL_VERSION",
        retryable: false,
        protocol: PROTOCOL_VERSION,
      });
      return;
    }
    // A stopped handler and the shim give the same code (CLI-4: before, the shim gave SERVER_STOPPED)
    if (stopped) {
      sendError(res, 503, "The server is stopping", "UNAVAILABLE", true);
      return;
    }
    // A preflight without CORS: no procedure runs for it, and the browser sees no CORS header
    if (!legacy && req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    // A web page must not reach the procedures: host, origin, method and body type
    // Ambient credentials (cookies) are trusted only from a named origin. The shim keeps its former
    // checks for a server that reads no cookies.
    const ambient = needsNamedOrigin(ambientMode, req.headers, !legacy);
    // A refusal is FORBIDDEN with its reason, also in the shim (CLI-4)
    const check = checkBrowserRequest(req, guard, true, ambient);
    if (!check.ok) {
      sendError(res, check.status, check.message, check.code, false, { reason: check.reason });
      return;
    }
    // A closed connection or close() aborts the request: a stream stops, and its handler gets return()
    const controller = new AbortController();
    openRequests.add(controller);
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
      requestEnded(controller);
    });
    let serverRequest: ServerRequest | null = null;
    try {
      let runs: BatchRun[] | undefined;
      try {
        const body = await readBody(req);
        if (isBatch(req)) runs = batchRuns(req, body, controller.signal);
        else serverRequest = toServerRequest(req, body);
      } catch (error) {
        const status = error instanceof BodyError ? error.httpStatus : 400;
        // A body above the limit is PAYLOAD_TOO_LARGE, as on the MCP face and the WebSocket face (CLI-85)
        sendError(res, status, (error as Error).message, status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST");
        return;
      }
      if (runs) {
        // One NDJSON stream for the calls of the batch: the lines, the backpressure and the
        // keep-alive of a stream of one call (CLI-32)
        await writeNdjsonStream(res, batchFrames(server, runs, batch!.concurrency, errorOf), { signal: controller.signal, keepAlive, errorOf, clock });
        return;
      }
      if (!serverRequest) {
        sendError(res, 400, "Invalid request: could not parse RPC method from URL", "INVALID_REQUEST");
        return;
      }
      serverRequest.signal = controller.signal;

      const serverResponse = await server.handle(serverRequest);
      if (serverResponse.stream) {
        await streamToHttp(serverResponse, serverResponse.stream, req, res, controller.signal);
        return;
      }
      toHttp(serverResponse, res);
    } catch (error) {
      if (!res.headersSent) sendLastResort(res, error, serverRequest ?? undefined, (error as Error).message || "Internal server error");
    } finally {
      // An open response (an error before its end) stays in progress until its close event
      if (res.writableEnded || res.destroyed) requestEnded(controller);
    }
  };

  /** This function serves a request, and does not reject: an error ends the response with 500. */
  const settle = (req: IncomingMessage, res: NodeResponse): Promise<void> =>
    serve(req, res).catch((error: unknown) => {
      if (!res.headersSent) sendLastResort(res, error, undefined, error instanceof Error ? error.message : String(error));
      else if (!res.writableEnded) res.destroy();
    });

  const handler = ((req: IncomingMessage, res: NodeResponse): boolean => {
    if (!matches(req)) return false;
    void settle(req, res);
    return true;
  }) as NodeProcedureHandler;

  return Object.assign(handler, {
    basePath,
    async handle(req: IncomingMessage, res: NodeResponse): Promise<boolean> {
      if (!matches(req)) return false;
      await settle(req, res);
      return true;
    },
    matches,
    middleware(req: IncomingMessage, res: NodeResponse, next: (error?: unknown) => void): void {
      if (!handler(req, res)) next();
    },
    start(): void {
      stopped = false;
    },
    stopIntake(): void {
      stopped = true;
    },
    drain(deadline: number, signal?: AbortSignal): Promise<void> {
      if (openRequests.size === 0 || signal?.aborted) return Promise.resolve();
      return new Promise<void>((resolve) => {
        let timer: Cancel | undefined;
        const done = (): void => {
          timer?.();
          signal?.removeEventListener("abort", done);
          const index = idleWaiters.indexOf(done);
          if (index >= 0) idleWaiters.splice(index, 1);
          resolve();
        };
        idleWaiters.push(done);
        signal?.addEventListener("abort", done, { once: true });
        timer = clock.after(Math.max(0, deadline - clock.now()), done);
        timer.unref?.();
      });
    },
    inFlight(): number {
      return openRequests.size;
    },
    close(): void {
      for (const controller of [...openRequests]) controller.abort();
      openRequests.clear();
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const waiter of waiters) waiter();
    },
  });
}
