/**
 * The polite requests of the map data procedures: one pace for each host of the process, and a
 * transport of `polite-crawler/api` over the `fetch` of the module.
 */

import { InvocationError } from "@procedures/client/browser";
import { ApiError, fetchTransport, send, statusLine, type Exchange, type FetchLike, type Pace, type Reply, type Transport } from "polite-crawler/api";
import { HostScheduler, realClock } from "polite-crawler/politeness";

/** The headers of a response: a `Headers` of `fetch`, or a record with names in lowercase. */
export type GeoFetchHeaders =
  | { forEach(callback: (value: string, name: string) => void): void }
  | Readonly<Record<string, string | readonly string[]>>;

/** The response of a `GeoFetch`: the parts of a `Response` that the procedures use. */
export interface GeoFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText?: string | undefined;
  /** The map data procedures read the headers, for example `Retry-After`. */
  readonly headers?: GeoFetchHeaders | undefined;
  json(): Promise<unknown>;
  /** The map data procedures read the body as text. */
  text?(): Promise<string>;
  /** A request of `geoSend` with `read: "bytes"` reads the body with this member, for example an image. */
  arrayBuffer?(): Promise<ArrayBuffer>;
}

/**
 * The `fetch` of the module. The global `fetch` and `createHostFetch()` of `@procedures/http` have
 * each member, but `createHostFetch()` has no `arrayBuffer()`. A `FetchJson` is sufficient for
 * `geo.geocode` and `geo.route`. The map data procedures also need `text()` and the headers.
 *
 * Only `geo.soilAtPoint` sends a `POST` with a body: a query that only reads. `createHostFetch()`
 * sends it only to a host of its option `readOnlyPost`.
 */
export type GeoFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal; redirect?: "manual"; method?: "POST"; body?: string }
) => Promise<GeoFetchResponse>;

/** The User-Agent of the transport. Each exchange of this package sends its own User-Agent, from the input. */
const TRANSPORT_AGENT = "@procedures/geo";

/** This function calls the callback for each header of a response. */
function eachHeader(headers: GeoFetchHeaders | undefined, callback: (value: string, name: string) => void): void {
  if (headers === undefined) return;
  if (typeof headers.forEach === "function") {
    (headers as { forEach(callback: (value: string, name: string) => void): void }).forEach(callback);
    return;
  }
  for (const [name, value] of Object.entries(headers as Readonly<Record<string, string | readonly string[]>>)) {
    callback(typeof value === "string" ? value : value.join(", "), name.toLowerCase());
  }
}

/**
 * This function gives a `FetchLike` of `polite-crawler/api` over the `fetch` of the module. It
 * sends GET requests. With `readOnlyPost`, it also sends a POST with its body: the caller tells that
 * the POST only reads, for example the query of `geo.soilAtPoint`. A fetch with a host policy keeps
 * its policy, and its own rules for redirects. The response gives `arrayBuffer()` when the response
 * of the fetch has it, so an exchange with `read: "bytes"` gets the bytes of the body.
 *
 * @param readOnlyPost - True when each POST of the transport only reads. The default is false: no POST.
 */
export function fetchLikeOf(fetch: GeoFetch, readOnlyPost = false): FetchLike {
  return async (url, init) => {
    const post = init.method === "POST" && readOnlyPost;
    if (init.method !== "GET" && !post) {
      throw new ApiError(`The fetch of @procedures/geo sends only GET requests, and a POST only for a query that only reads, not ${init.method}`);
    }
    const response = await fetch(url, {
      headers: { ...init.headers },
      signal: init.signal,
      redirect: init.redirect,
      ...(post ? { method: "POST" as const, ...(init.body !== undefined ? { body: init.body } : {}) } : {}),
    });
    const text = response.text;
    if (typeof text !== "function") throw new ApiError("The fetch of the module gives no text(): give the global fetch or createHostFetch() of @procedures/http");
    const arrayBuffer = response.arrayBuffer;
    return {
      status: response.status,
      statusText: response.statusText ?? "",
      headers: { forEach: (callback) => eachHeader(response.headers, callback) },
      text: () => text.call(response),
      // send() of polite-crawler reads the bytes with arrayBuffer(), and gives an ApiError when the response has no arrayBuffer()
      ...(typeof arrayBuffer === "function" ? { arrayBuffer: () => arrayBuffer.call(response) } : {}),
    };
  };
}

/**
 * This function gives the transport of one call: the `fetch` of the module, with a time limit.
 *
 * @param readOnlyPost - True when each POST of the call only reads (`fetchLikeOf`). The default is false: no POST.
 */
export function geoTransport(fetch: GeoFetch, timeoutMs: number, readOnlyPost = false): Transport {
  return fetchTransport({ userAgent: TRANSPORT_AGENT, timeoutMs, fetch: fetchLikeOf(fetch, readOnlyPost) });
}

let processPace: Pace | undefined;

/**
 * This function gives the pace of the process: one scheduler that keeps one request in progress
 * for each host, and a rest between two requests. Each module of this package without its own
 * pace uses it. The first call makes it.
 */
export function geoPace(): Pace {
  processPace ??= { scheduler: new HostScheduler(realClock, 4), now: () => realClock.now() };
  return processPace;
}

/** The settings of one call of a map data procedure: the `fetch` and the pace of the module, and the signal of the call. */
export interface MapDataContext {
  readonly fetch: GeoFetch;
  readonly pace: Pace;
  readonly signal?: AbortSignal | undefined;
}

/** One request of a map data procedure. */
export interface GeoRequest {
  /** The name of the server in the errors, for example `Overpass API`. */
  readonly source: string;
  /** The text that tells what the request asks for, in the errors. */
  readonly what: string;
  readonly exchange: Exchange;
  /** The time limit of the transport, in milliseconds. */
  readonly timeoutMs: number;
  /** The largest number of sends when the answer has a status of `TRANSIENT_STATUSES`. The default is `DEFAULT_ATTEMPTS`. */
  readonly attempts?: number | undefined;
  /** True when the exchange is a POST that only reads, for example the query of `geo.soilAtPoint`. The default is false: a POST fails. */
  readonly readOnlyPost?: boolean | undefined;
}

/** These statuses tell that the server is busy for a time: 429, 502, 503 and 504. The pace parks the host after each of them. */
export const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);

/** The number of sends of a request when its answers have a transient status, if the request gives no number. */
export const DEFAULT_ATTEMPTS = 3;

/**
 * This function sends one request at the pace of its host, and gives the reply. A refusal of the
 * host policy (an `InvocationError` with the code `FORBIDDEN`) keeps its code and its reason.
 *
 * - When the answer has a status of `TRANSIENT_STATUSES`, the function sends the request again, up
 *   to `attempts` sends. The pace parks the host before each new send: for the `Retry-After` of the
 *   server, or for a backoff with jitter.
 * - After the last send, the function gives the last reply, with its status.
 *
 * @throws ApiError when the request gets no answer, or when the pace stops the host.
 * @throws RangeError when `attempts` is not a whole number from 1.
 */
export async function geoSend(context: MapDataContext, request: GeoRequest): Promise<Reply> {
  let refusal: InvocationError | undefined;
  const fetch: GeoFetch = async (url, init) => {
    try {
      return await context.fetch(url, init);
    } catch (error) {
      // send() of polite-crawler gives a new ApiError for an error of the transport, with no cause
      if (error instanceof InvocationError && error.code === "FORBIDDEN") refusal = error;
      throw error;
    }
  };
  const { source, what, exchange } = request;
  const attempts = request.attempts ?? DEFAULT_ATTEMPTS;
  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError("The number of attempts is not a whole number from 1");
  const transport = geoTransport(fetch, request.timeoutMs, request.readOnlyPost === true);
  const host = new URL(exchange.url).host;
  try {
    for (let attempt = 1; ; attempt += 1) {
      const { reply } = await send(context.pace, transport, { source, host, what, exchange }, context.signal);
      if (attempt >= attempts || !TRANSIENT_STATUSES.has(reply.status)) return reply;
    }
  } catch (error) {
    throw refusal ?? error;
  }
}

/**
 * This function gives the body of an answer as JSON.
 *
 * @throws Error when the status is not 200, or when the body is not JSON.
 */
export function answerJson(reply: Reply, source: string): unknown {
  if (reply.status !== 200) throw new Error(`${source} gave ${statusLine(reply)}`);
  try {
    return JSON.parse(reply.body) as unknown;
  } catch (error) {
    throw new Error(`${source} gave a body that is not JSON`, { cause: error });
  }
}
