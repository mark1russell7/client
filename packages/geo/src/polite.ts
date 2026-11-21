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
}

/**
 * The `fetch` of the module. The global `fetch` and `createHostFetch()` of `@procedures/http` have
 * each member. A `FetchJson` is sufficient for `geo.geocode` and `geo.route`. The map data
 * procedures also need `text()` and the headers.
 */
export type GeoFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal; redirect?: "manual" }
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
 * sends only GET requests. A fetch with a host policy keeps its policy, and its own rules for redirects.
 */
export function fetchLikeOf(fetch: GeoFetch): FetchLike {
  return async (url, init) => {
    if (init.method !== "GET") throw new ApiError(`The fetch of @procedures/geo sends only GET requests, not ${init.method}`);
    const response = await fetch(url, { headers: { ...init.headers }, signal: init.signal, redirect: init.redirect });
    const text = response.text;
    if (typeof text !== "function") throw new ApiError("The fetch of the module gives no text(): give the global fetch or createHostFetch() of @procedures/http");
    return {
      status: response.status,
      statusText: response.statusText ?? "",
      headers: { forEach: (callback) => eachHeader(response.headers, callback) },
      text: () => text.call(response),
    };
  };
}

/** This function gives the transport of one call: the `fetch` of the module, with a time limit. */
export function geoTransport(fetch: GeoFetch, timeoutMs: number): Transport {
  return fetchTransport({ userAgent: TRANSPORT_AGENT, timeoutMs, fetch: fetchLikeOf(fetch) });
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
}

/**
 * This function sends one request at the pace of its host, and gives the reply. A refusal of the
 * host policy (an `InvocationError` with the code `FORBIDDEN`) keeps its code and its reason.
 *
 * @throws ApiError when the request gets no answer, or when the pace stops the host.
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
  try {
    const { reply } = await send(context.pace, geoTransport(fetch, request.timeoutMs), { source, host: new URL(exchange.url).host, what, exchange }, context.signal);
    return reply;
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
