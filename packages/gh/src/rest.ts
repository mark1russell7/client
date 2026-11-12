/**
 * A client of the REST API of GitHub for a program that sends many requests: a dispatcher, a
 * crawler or a loop that polls. It sends each request with `@procedures/http`, not with the `gh`
 * CLI, so a request starts no process.
 *
 * - A GET with a stored answer is a conditional request. GitHub does not count an answer 304 for
 *   the primary limit, and the client then gives the stored answer.
 * - A sliding window of `@mark1russell7/service/limiter` holds the secondary limit: 900 points in
 *   each minute. A GET costs 1 point, and a POST, a PUT, a PATCH or a DELETE costs 5 points.
 * - A request that changes data waits one second after the request before it.
 * - After a refusal for the rate, the client sends no request until the time that GitHub gives.
 */

import type { Cancel, Clock } from "@mark1russell7/service/clock";
import { realClock } from "@mark1russell7/service/clock";
import { keyedLimiter, memoryStore, retryAfterSeconds, type LocalLimiter } from "@mark1russell7/service/limiter";
import { httpRequest } from "@procedures/http";

/** The methods of a REST request. */
export type RestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** One request to the REST API. */
export interface RestRequest {
  readonly method: RestMethod;
  /** This path is the endpoint after the base URL, for example `/repos/octo/app/actions/runs`. It has no query. */
  readonly path: string;
  /** These fields are the query of the URL. The client sorts them, so one query has one URL. */
  readonly query?: Readonly<Record<string, string>> | undefined;
  /** This value is the JSON body. `null` and `undefined` are no body, and a GET has no body. */
  readonly body?: unknown;
}

/** The answer to one request. */
export interface RestAnswer {
  /** This number is the status of the answer. A 304 with a stored answer gives 200. */
  readonly status: number;
  /** This value is the JSON body, or `null` for an empty body. */
  readonly body: unknown;
  /** This field is `true` when the body is the stored answer of an answer 304. */
  readonly cached: boolean;
}

/** One exchange that a transport sends. */
export interface RestExchange {
  readonly method: RestMethod;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** This value is the JSON body, or `undefined` for no body. */
  readonly body: unknown;
}

/** The reply of a transport: the status, the headers and the JSON body. */
export interface RestReply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | readonly string[]>>;
  readonly body: unknown;
}

/** A transport sends one exchange. It throws only when it gets no reply: each status is a reply. */
export type RestTransport = (exchange: RestExchange, signal: AbortSignal) => Promise<RestReply>;

/** The options of a REST client. */
export interface RestClientOptions {
  /** This value is the token, or a function that gives it before each request. A token of a GitHub App changes each hour. */
  readonly token: string | (() => string | Promise<string>);
  /** This URL is the base of the API. The default is `https://api.github.com`. */
  readonly baseUrl?: string | undefined;
  /** This text is the version of the API. The default is `2022-11-28`. */
  readonly apiVersion?: string | undefined;
  /** This text is the `user-agent` header. The default is `procedures-gh`. */
  readonly userAgent?: string | undefined;
  /** This count is the points of the secondary limit in each minute. The default is 900. */
  readonly pointsPerMinute?: number | undefined;
  /** This count is the most stored answers. The default is 1,000, and 0 stores no answer. */
  readonly cacheEntries?: number | undefined;
  /** This time is the longest wait of a request for the limits, in milliseconds. The default is 60,000. */
  readonly maxWaitMs?: number | undefined;
  /** This transport sends each exchange. The default sends it with `httpRequest` of `@procedures/http`. */
  readonly transport?: RestTransport | undefined;
  /** This clock gives the monotonic time and the timers. The default is the clock of the platform. */
  readonly clock?: Clock | undefined;
}

/** The counts of a REST client, for a log or a measure. */
export interface RestClientState {
  /** This count is the exchanges that the transport sent. */
  readonly sent: number;
  /** This count is the answers 304 that gave a stored answer. */
  readonly notModified: number;
  /** This count is the refusals for the rate. */
  readonly rateRefusals: number;
  /** This count is the stored answers. */
  readonly cacheEntries: number;
  /** This number is the last `x-ratelimit-remaining` of GitHub, or `null` before it. */
  readonly remaining: number | null;
  /** This time is the wait until the client sends again after a refusal for the rate, in milliseconds. */
  readonly blockedForMs: number;
}

/** A client of the REST API of GitHub. */
export interface RestClient {
  /** This method sends one request. It throws when it gets no answer or when the wait for a limit is too long. */
  request(request: RestRequest, signal: AbortSignal): Promise<RestAnswer>;
  /** This method gives the counts of the client. */
  state(): RestClientState;
}

/** This error tells that a request did not start because the wait for a limit is longer than `maxWaitMs`. */
export class RestRateError extends Error {
  override readonly name = "RestRateError";
  /** This time is the wait until the request can start, in milliseconds. */
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

/** The base URL of the REST API of GitHub. */
export const GITHUB_API_URL: string = "https://api.github.com";
/** The version of the REST API that the client asks for. */
export const GITHUB_API_VERSION: string = "2022-11-28";
/** The points of the secondary limit of GitHub in each minute. */
export const GITHUB_POINTS_PER_MINUTE: number = 900;
/** The points of a GET, and of a request that changes data. */
export const GITHUB_POINTS: { readonly read: number; readonly write: number } = { read: 1, write: 5 };
/** The wait after a refusal for the rate with no time in its headers: one minute, then two times longer, to 16 minutes. */
export const RATE_WAIT_MS: { readonly first: number; readonly last: number } = { first: 60_000, last: 960_000 };
/** The longest wait that the headers of an answer can set: one hour and one minute. */
export const LONGEST_RATE_WAIT_MS: number = 3_660_000;

const METHODS: readonly string[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** This function gives one header of a reply with its name in lowercase, or `undefined`. */
function header(reply: RestReply, name: string): string | undefined {
  for (const [key, value] of Object.entries(reply.headers)) {
    if (key.toLowerCase() !== name) continue;
    return typeof value === "string" ? value : value.join(", ");
  }
  return undefined;
}

/** This function reads a whole number of 0 or more from a header, or gives `null`. */
function wholeNumber(text: string | undefined): number | null {
  if (text === undefined || !/^\s*\d{1,15}\s*$/.test(text)) return null;
  return Number(text.trim());
}

/** This function examines the path of a request. A path that can leave its endpoint is refused. */
function checkedPath(path: unknown): string {
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("//") || /[?#\\\s\u0000-\u001f\u007f]/.test(path)) {
    throw new TypeError("The path of a REST request is not a path that starts with / and has no query.");
  }
  const segments = path.split("/").slice(1);
  if (segments.some((segment) => /^(\.|%2e){1,2}$/i.test(segment))) {
    throw new TypeError("The path of a REST request has a segment . or ..");
  }
  return path;
}

/**
 * This function decides the wait after a refusal for the rate, in milliseconds, by the rules of
 * GitHub. A `retry-after` header gives the wait. With `x-ratelimit-remaining` 0, the wait ends at
 * `x-ratelimit-reset`, on the time of the `date` header. Else the wait is one minute, two times
 * longer for each refusal in a sequence, to 16 minutes.
 */
export function rateWaitMs(reply: RestReply, strikes: number): number {
  const retryAfter = wholeNumber(header(reply, "retry-after"));
  if (retryAfter !== null) return Math.min(retryAfter * 1000, LONGEST_RATE_WAIT_MS);
  const remaining = wholeNumber(header(reply, "x-ratelimit-remaining"));
  const reset = wholeNumber(header(reply, "x-ratelimit-reset"));
  const date = Date.parse(header(reply, "date") ?? "");
  if (remaining === 0 && reset !== null && Number.isFinite(date)) {
    return Math.min(Math.max(reset * 1000 - date, 0) + 1000, LONGEST_RATE_WAIT_MS);
  }
  return Math.min(RATE_WAIT_MS.first * 2 ** Math.max(strikes, 0), RATE_WAIT_MS.last);
}

/**
 * This function tells if a reply is a refusal for the rate. GitHub refuses with 429, or with 403
 * and one of these: `x-ratelimit-remaining` 0, a `retry-after` header, or a message about a rate limit.
 */
export function isRateRefusal(reply: RestReply): boolean {
  if (reply.status === 429) return true;
  if (reply.status !== 403) return false;
  if (wholeNumber(header(reply, "x-ratelimit-remaining")) === 0) return true;
  if (header(reply, "retry-after") !== undefined) return true;
  const message = typeof reply.body === "object" && reply.body !== null ? (reply.body as { message?: unknown }).message : undefined;
  return typeof message === "string" && /rate limit/i.test(message);
}

/**
 * The default transport: `httpRequest` of `@procedures/http`, with its host policy and its limits of size and time.
 * A redirect to another origin does not send the token. The transport parses the JSON itself, so an error text has no part of the body.
 */
export const httpTransport: RestTransport = async (exchange, signal) => {
  const reply = await httpRequest(
    { method: exchange.method, url: exchange.url, headers: { ...exchange.headers }, json: exchange.body, responseType: "text" },
    { signal },
  );
  const text = typeof reply.body === "string" ? reply.body : "";
  let body: unknown = null;
  if (text.trim().length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`The answer ${reply.status} to ${exchange.method} ${new URL(exchange.url).pathname.slice(0, 200)} is not JSON.`);
    }
  }
  return { status: reply.status, headers: reply.headers, body };
};

/** This function waits on the clock. The signal ends the wait with an error. */
function pause(clock: Clock, ms: number, signal: AbortSignal, what: string): Promise<void> {
  // A wait on a clock with a signal has no function in @mark1russell7/algebra/clock yet. This copy goes when it has one.
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error(`The signal stopped the request ${what}.`));
      return;
    }
    let cancel: Cancel = () => {};
    const stop = (): void => {
      cancel();
      reject(new Error(`The signal stopped the request ${what}.`));
    };
    signal.addEventListener("abort", stop, { once: true });
    cancel = clock.after(ms, () => {
      signal.removeEventListener("abort", stop);
      resolve();
    });
  });
}

interface Stored {
  readonly etag: string;
  readonly body: unknown;
}

/**
 * This function makes a client of the REST API of GitHub. It refuses options that are not valid with
 * a `RangeError` or a `TypeError`. No error text of the client has the token or the body of an answer.
 */
export function createRestClient(options: RestClientOptions): RestClient {
  const base = new URL(options.baseUrl ?? GITHUB_API_URL);
  if (base.protocol !== "https:" || base.search !== "" || base.hash !== "" || base.username !== "" || base.password !== "") {
    throw new TypeError("The base URL of a REST client is not an https URL with no query and no credential.");
  }
  const basePath = base.pathname.replace(/\/+$/, "");
  const apiVersion = options.apiVersion ?? GITHUB_API_VERSION;
  const userAgent = options.userAgent ?? "procedures-gh";
  for (const [name, value] of [["version", apiVersion], ["user agent", userAgent]] as const) {
    if (typeof value !== "string" || value.length === 0 || /[\r\n]/.test(value)) {
      throw new TypeError(`The ${name} of a REST client is not a text with a character and no line break.`);
    }
  }
  const pointsPerMinute = options.pointsPerMinute ?? GITHUB_POINTS_PER_MINUTE;
  if (!Number.isSafeInteger(pointsPerMinute) || pointsPerMinute < GITHUB_POINTS.write) {
    throw new RangeError(`The points of a REST client in each minute are not a whole number of ${GITHUB_POINTS.write} or more.`);
  }
  const cacheEntries = options.cacheEntries ?? 1000;
  if (!isCount(cacheEntries)) throw new RangeError("The stored answers of a REST client are not a whole number of 0 or more.");
  const maxWaitMs = options.maxWaitMs ?? 60_000;
  if (!isCount(maxWaitMs)) throw new RangeError("The longest wait of a REST client is not a whole number of milliseconds of 0 or more.");
  if (typeof options.token !== "string" && typeof options.token !== "function") {
    throw new TypeError("The token of a REST client is not a text or a function.");
  }
  const transport = options.transport ?? httpTransport;
  const clock = options.clock ?? realClock;
  const store = memoryStore(clock);
  const points: LocalLimiter = keyedLimiter(
    "github-points",
    { key: "token", policy: { type: "sliding-window", limit: { value: pointsPerMinute, unit: "count" }, window: { value: 60, unit: "s" } }, store: { kind: "local" }, evict: { maxKeys: { value: 1, unit: "count" } } },
    store,
  );
  const writes: LocalLimiter = keyedLimiter(
    "github-writes",
    { key: "token", policy: { type: "sliding-window", limit: { value: 1, unit: "count" }, window: { value: 1, unit: "s" } }, store: { kind: "local" }, evict: { maxKeys: { value: 1, unit: "count" } } },
    store,
  );
  const cache = new Map<string, Stored>();
  let blockedUntil = Number.NEGATIVE_INFINITY;
  let strikes = 0;
  let remaining: number | null = null;
  let sent = 0;
  let notModified = 0;
  let rateRefusals = 0;

  const token = async (): Promise<string> => {
    const value = typeof options.token === "string" ? options.token : await options.token();
    if (typeof value !== "string" || value.length === 0 || /[\s]/.test(value)) {
      throw new TypeError("The token of a REST client is not a text with a character and no space or line break.");
    }
    return value;
  };

  /** This function waits until the limiter permits a take, or throws when the wait passes the deadline. */
  const admit = async (limiter: LocalLimiter, units: number, deadline: number, signal: AbortSignal, what: string): Promise<void> => {
    for (;;) {
      const decision = limiter.tryTakeSync("token", units);
      if (decision.allowed) return;
      if (decision.cause === "capacity") throw new RangeError(`The request ${what} costs more points than a minute has.`);
      const wait = Math.max(1, retryAfterSeconds(decision.retryAfter)) * 1000;
      if (clock.now() + wait > deadline) throw new RestRateError(`The request ${what} waits ${wait} ms for the limit of the rate, more than its longest wait.`, wait);
      await pause(clock, wait, signal, what);
    }
  };

  /** This function waits until the block of a refusal for the rate ends, or throws when the block passes the deadline. */
  const unblocked = async (deadline: number, signal: AbortSignal, what: string): Promise<void> => {
    for (;;) {
      const blocked = Math.ceil(blockedUntil - clock.now());
      if (blocked <= 0) return;
      if (clock.now() + blocked > deadline) {
        throw new RestRateError(`GitHub refused a request for the rate. The request ${what} waits ${blocked} ms, more than its longest wait.`, blocked);
      }
      await pause(clock, blocked, signal, what);
    }
  };

  const urlOf = (request: RestRequest): string => {
    const url = new URL(base.origin);
    url.pathname = basePath + checkedPath(request.path);
    const query = request.query ?? {};
    if (typeof query !== "object" || query === null) throw new TypeError("The query of a REST request is not a record of texts.");
    for (const key of Object.keys(query).sort()) {
      const value = query[key];
      if (typeof value !== "string") throw new TypeError(`The query field ${JSON.stringify(key)} of a REST request is not a text.`);
      url.searchParams.append(key, value);
    }
    return url.href;
  };

  return {
    async request(request, signal) {
      if (typeof request !== "object" || request === null || !METHODS.includes(request.method)) {
        throw new TypeError("The method of a REST request is not GET, POST, PUT, PATCH or DELETE.");
      }
      const what = `${request.method} ${typeof request.path === "string" ? request.path.slice(0, 200) : "?"}`;
      const url = urlOf(request);
      const read = request.method === "GET";
      const body = request.body === null ? undefined : request.body;
      if (read && body !== undefined) throw new TypeError(`The request ${what} is a GET with a body.`);
      if (signal.aborted) throw new Error(`The signal stopped the request ${what}.`);
      const deadline = clock.now() + maxWaitMs;
      await unblocked(deadline, signal, what);
      if (!read) await admit(writes, 1, deadline, signal, what);
      await admit(points, read ? GITHUB_POINTS.read : GITHUB_POINTS.write, deadline, signal, what);
      // A refusal for the rate can come during the waits for the limiters, so the client examines the block again.
      await unblocked(deadline, signal, what);

      const headers: Record<string, string> = {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${await token()}`,
        "user-agent": userAgent,
        "x-github-api-version": apiVersion,
      };
      const stored = read && cacheEntries > 0 ? cache.get(url) : undefined;
      if (stored !== undefined) headers["if-none-match"] = stored.etag;
      sent += 1;
      const reply = await transport({ method: request.method, url, headers, body }, signal);
      if (!isCount(reply.status)) throw new Error(`The transport gave the request ${what} a status that is not a number.`);

      const left = wholeNumber(header(reply, "x-ratelimit-remaining"));
      if (left !== null) remaining = left;
      if (isRateRefusal(reply)) {
        rateRefusals += 1;
        blockedUntil = Math.max(blockedUntil, clock.now() + rateWaitMs(reply, strikes));
        strikes += 1;
        return { status: reply.status, body: reply.body ?? null, cached: false };
      }
      strikes = 0;
      if (left === 0) blockedUntil = Math.max(blockedUntil, clock.now() + rateWaitMs(reply, 0));

      if (read && reply.status === 304 && stored !== undefined) {
        notModified += 1;
        cache.delete(url);
        cache.set(url, stored);
        return { status: 200, body: structuredClone(stored.body), cached: true };
      }
      if (read && cacheEntries > 0) {
        const etag = header(reply, "etag");
        if (reply.status === 200 && etag !== undefined && etag.length > 0) {
          cache.delete(url);
          cache.set(url, { etag, body: structuredClone(reply.body ?? null) });
          while (cache.size > cacheEntries) cache.delete(cache.keys().next().value!);
        } else {
          cache.delete(url);
        }
      }
      return { status: reply.status, body: reply.body ?? null, cached: false };
    },
    state() {
      return { sent, notModified, rateRefusals, cacheEntries: cache.size, remaining, blockedForMs: Math.max(0, blockedUntil - clock.now()) };
    },
  };
}
