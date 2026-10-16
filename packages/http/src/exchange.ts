/**
 * One HTTP exchange with the host check, the redirects and the limits (roadmap R38).
 *
 * The exchange uses `node:http` and `node:https`, not `fetch`: the connection must use the
 * addresses that the host check allowed. A `lookup` function gives those addresses to the socket,
 * so the DNS cannot give another address after the check (DNS rebinding). The exchange follows
 * each redirect itself and examines each new host. Each request gets its own connection.
 */

import { request as plainRequest, type IncomingHttpHeaders, type IncomingMessage, type RequestOptions } from "node:http";
import { request as tlsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { PassThrough, pipeline, type Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { ProcedurePath } from "@procedures/client";
import { HttpError } from "./errors.js";
import { checkHost, DEFAULT_HOST_POLICY, type AllowedTarget, type HostPolicy } from "./policy.js";
import type { CallScope } from "./scope.js";

/** One mebibyte. */
export const MIB: number = 1024 * 1024;

/** The default size limit of a response body and of a request body: 10 MiB. */
export const DEFAULT_MAX_BYTES: number = 10 * MIB;

/** The default size limit of one NDJSON line and of one server-sent event: 1 MiB. */
export const DEFAULT_ITEM_BYTES: number = MIB;

/** The default time of `http.request` and `http.json`: 30 seconds. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** The default number of redirects that a call follows. */
export const DEFAULT_MAX_REDIRECTS = 5;

/** The settings of a module: the host policy and the size limits of the host. */
export interface HttpSettings {
  readonly policy: HostPolicy;
  /** The largest body of a request, in bytes. */
  readonly maxRequestBytes: number;
  /** The largest body of a response, in bytes. An input can set a smaller limit. */
  readonly maxResponseBytes: number;
}

/** The settings of the default module: each public host, and 10 MiB for each body. */
export const DEFAULT_SETTINGS: HttpSettings = {
  policy: DEFAULT_HOST_POLICY,
  maxRequestBytes: DEFAULT_MAX_BYTES,
  maxResponseBytes: DEFAULT_MAX_BYTES,
};

/** The headers that each request gets, unless the input sets them. */
const DEFAULT_HEADERS: Readonly<Record<string, string>> = {
  "accept-encoding": "gzip, deflate, br",
  "user-agent": "@procedures/http",
};

/** What to do with a redirect. */
export type RedirectMode = "follow" | "manual" | "error";

/** A request before the first exchange. */
export interface PreparedRequest {
  readonly url: URL;
  readonly method: string;
  /** The headers, with names in lowercase. */
  readonly headers: Record<string, string>;
  readonly body?: Buffer | undefined;
  readonly redirect: RedirectMode;
  readonly maxRedirects: number;
}

/** The parts of a request that the procedures share. */
export interface RequestParts {
  readonly url: string;
  readonly method?: string | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly query?: Readonly<Record<string, QueryValue | readonly QueryValue[]>> | undefined;
  readonly redirect?: RedirectMode | undefined;
  readonly maxRedirects?: number | undefined;
}

/** A value of the query of a URL. */
export type QueryValue = string | number | boolean;

/** The response of an exchange. */
export interface Exchange {
  readonly response: IncomingMessage;
  /** The body without its content encoding (gzip, deflate or br). */
  readonly body: Readable;
  /** The URL of the response: the last URL after the redirects. */
  readonly url: string;
  /** The URLs of the redirects that the exchange followed. */
  readonly redirects: readonly string[];
  /** This function closes the connection. */
  close(): void;
}

/** The headers that a redirect to another origin removes, as `fetch` does. */
const CREDENTIAL_HEADERS = ["authorization", "cookie", "proxy-authorization"];

/** This function parses the URL of an input, and adds the query. Only `http:` and `https:` pass. */
export function urlOf(parts: RequestParts, path: ProcedurePath): URL {
  let url: URL;
  try {
    url = new URL(parts.url);
  } catch {
    throw new HttpError("BAD_URL", `${path.join(".")}: ${JSON.stringify(parts.url)} is not a URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError("BAD_URL", `${path.join(".")}: the URL ${url.href} is not an http: or https: URL`);
  }
  for (const [key, value] of Object.entries(parts.query ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
  }
  url.hash = "";
  return url;
}

/** The headers of an input with names in lowercase. A later name of the same header wins. */
export function headersOf(headers: Readonly<Record<string, string>> | undefined, defaults: Readonly<Record<string, string>> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(defaults)) out[name.toLowerCase()] = value;
  for (const [name, value] of Object.entries(headers ?? {})) out[name.toLowerCase()] = value;
  return out;
}

/** This function makes a request from the shared parts of an input. */
export function prepare(parts: RequestParts, path: ProcedurePath, settings: HttpSettings, extra: { headers?: Record<string, string>; body?: Buffer | undefined } = {}): PreparedRequest {
  const body = extra.body;
  if (body !== undefined && body.length > settings.maxRequestBytes) {
    throw new HttpError("REQUEST_TOO_LARGE", `${path.join(".")}: the body of the request has ${body.length} bytes, and the limit is ${settings.maxRequestBytes} bytes`);
  }
  const headers = headersOf(parts.headers, { ...DEFAULT_HEADERS, ...extra.headers });
  const url = urlOf(parts, path);
  if ((url.username !== "" || url.password !== "") && headers["authorization"] === undefined) {
    headers["authorization"] = `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString("base64")}`;
  }
  url.username = "";
  url.password = "";
  return {
    url,
    method: (parts.method ?? "GET").toUpperCase(),
    headers,
    body,
    redirect: parts.redirect ?? "follow",
    maxRedirects: parts.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
  };
}

/** A `lookup` for the socket that gives only the addresses that the check allowed. */
function pinnedLookup(target: AllowedTarget): LookupFunction {
  return (_hostname, options, callback) => {
    const family = options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : options.family;
    const addresses = family === 4 || family === 6 ? target.addresses.filter((entry) => entry.family === family) : target.addresses;
    const first = addresses[0];
    if (first === undefined) {
      const error = new Error(`No allowed address of ${target.hostname} has the family IPv${String(family)}`) as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, "", 4);
      return;
    }
    if (options.all) callback(null, addresses.map((entry) => ({ address: entry.address, family: entry.family })));
    else callback(null, first.address, first.family);
  };
}

/** This function sends one request to the checked target, and gives the response. */
function send(request: { url: URL; method: string; headers: Record<string, string>; body?: Buffer | undefined }, target: AllowedTarget, scope: CallScope): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const options: RequestOptions = {
      method: request.method,
      host: target.hostname,
      port: target.port,
      path: `${request.url.pathname}${request.url.search}`,
      headers: request.body === undefined ? request.headers : { ...request.headers, "content-length": String(request.body.length) },
      lookup: pinnedLookup(target),
      signal: scope.signal,
      // A connection of its own: a pooled socket could belong to another check
      agent: false,
    };
    const outgoing = (request.url.protocol === "https:" ? tlsRequest : plainRequest)(options, resolve);
    outgoing.on("error", reject);
    outgoing.end(request.body);
  });
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** The body of a response without its content encoding. Only gzip, deflate and br are decoded. */
function decodedBody(response: IncomingMessage, method: string): Readable {
  const status = response.statusCode ?? 0;
  const encoding = String(response.headers["content-encoding"] ?? "").trim().toLowerCase();
  const empty = method === "HEAD" || status === 204 || status === 304 || response.headers["content-length"] === "0";
  const decoder =
    empty ? undefined
    : encoding === "gzip" || encoding === "x-gzip" ? createGunzip()
    : encoding === "deflate" ? createInflate()
    : encoding === "br" ? createBrotliDecompress()
    : undefined;
  if (decoder === undefined) return response;
  // An error of the response (an abort, a reset) reaches the reader of the decoded body
  const out = new PassThrough();
  out.on("error", () => undefined);
  pipeline(response, decoder, out, () => undefined);
  return out;
}

/** The result of a promise, or the error of the scope when the scope stops first. */
function untilStopped<T>(promise: Promise<T>, scope: CallScope): Promise<T> {
  if (scope.reason !== undefined) return Promise.reject(scope.error());
  return new Promise<T>((resolve, reject) => {
    const onStop = (): void => reject(scope.error());
    scope.signal.addEventListener("abort", onStop, { once: true });
    promise.then(
      (value) => {
        scope.signal.removeEventListener("abort", onStop);
        resolve(value);
      },
      (error: unknown) => {
        scope.signal.removeEventListener("abort", onStop);
        reject(error);
      },
    );
  });
}

/** The text of a header value: several values are joined with a comma. */
export function headerText(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(", ") : value;
}

/**
 * This function sends a request, follows the redirects and gives the response. Each URL goes
 * through the host check before its connection. A refused host throws `FORBIDDEN` with the
 * reason `host-not-allowed`.
 */
export async function exchange(request: PreparedRequest, policy: HostPolicy, scope: CallScope): Promise<Exchange> {
  const path = scope.path;
  let url = request.url;
  let method = request.method;
  let body = request.body;
  let headers = { ...request.headers };
  const redirects: string[] = [];
  for (;;) {
    // The look-up of the DNS has no signal: the stop of the scope ends the wait
    const target = await untilStopped(checkHost(policy, url, path, redirects.length === 0 ? "the URL" : `the redirect to ${url.href}`), scope);
    if (scope.reason !== undefined) throw scope.error();
    let response: IncomingMessage;
    try {
      response = await send({ url, method, headers, body }, target, scope);
    } catch (error) {
      if (scope.reason !== undefined) throw scope.error();
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      const reason = error instanceof Error ? error.message : String(error);
      throw new HttpError("CONNECTION", `${path.join(".")}: the request to ${url.origin} failed${code ? ` (${code})` : ""}: ${reason}`, undefined, { cause: error });
    }
    // A stop before the first read destroys the response: the reader gets the error, not the process
    response.on("error", () => undefined);
    scope.touch();
    const status = response.statusCode ?? 0;
    const location = headerText(response.headers.location);
    if (!isRedirect(status) || location === undefined || request.redirect === "manual") {
      return { response, body: decodedBody(response, method), url: url.href, redirects, close: () => response.destroy() };
    }
    response.destroy();
    if (request.redirect === "error") {
      throw new HttpError("REDIRECT", `${path.join(".")}: the response is a redirect (${status}) to ${location}, and the input has redirect: "error"`, status);
    }
    if (redirects.length >= request.maxRedirects) {
      throw new HttpError("TOO_MANY_REDIRECTS", `${path.join(".")}: more than ${request.maxRedirects} redirects (maxRedirects)`, status);
    }
    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      throw new HttpError("BAD_URL", `${path.join(".")}: the redirect location ${JSON.stringify(location)} is not a URL`, status);
    }
    if (next.protocol !== "http:" && next.protocol !== "https:") {
      throw new HttpError("BAD_URL", `${path.join(".")}: the redirect to ${next.href} is not an http: or https: URL`, status);
    }
    next.hash = "";
    // 303, and 301 or 302 after a POST, continue with a GET without the body, as fetch does
    if ((status === 303 && method !== "HEAD") || ((status === 301 || status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers = Object.fromEntries(Object.entries(headers).filter(([name]) => !name.startsWith("content-")));
    }
    if (next.origin !== url.origin) {
      headers = Object.fromEntries(Object.entries(headers).filter(([name]) => !CREDENTIAL_HEADERS.includes(name)));
    }
    redirects.push(next.href);
    url = next;
  }
}

/** This function reads a whole body. More than `maxBytes` bytes throws `RESPONSE_TOO_LARGE`. */
export async function readBody(body: Readable, maxBytes: number, scope: CallScope, response: IncomingMessage): Promise<Buffer> {
  const declared = Number(response.headers["content-length"]);
  const encoded = response.headers["content-encoding"] !== undefined;
  const tooLarge = (): HttpError =>
    new HttpError("RESPONSE_TOO_LARGE", `${scope.path.join(".")}: the body of the response has more than ${maxBytes} bytes (maxResponseBytes)`, response.statusCode);
  if (!encoded && Number.isFinite(declared) && declared > maxBytes) {
    body.destroy();
    throw tooLarge();
  }
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of body) {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
      size += buffer.length;
      if (size > maxBytes) throw tooLarge();
      chunks.push(buffer);
      scope.touch();
    }
  } catch (error) {
    if (scope.reason !== undefined) throw scope.error();
    if (error instanceof HttpError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new HttpError("CONNECTION", `${scope.path.join(".")}: the body of the response failed: ${reason}`, response.statusCode, { cause: error });
  } finally {
    body.destroy();
    response.destroy();
  }
  return Buffer.concat(chunks);
}

/** The headers of a response as JSON: a string, or a list for `set-cookie`. */
export function responseHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/** The first characters of a body, for a message. */
export function excerpt(body: Buffer | string, length = 200): string {
  const text = typeof body === "string" ? body : body.subarray(0, length * 4).toString("utf8");
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

/** True for a status in 200 to 299. */
export function isOk(status: number): boolean {
  return status >= 200 && status <= 299;
}

/**
 * The `HTTP_STATUS` error of a response whose status is not in 200 to 299. The message has the
 * start of the body (at most 4 KiB is read).
 */
export async function statusError(opened: Exchange, scope: CallScope): Promise<HttpError> {
  const status = opened.response.statusCode ?? 0;
  let start = "";
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of opened.body) {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
      chunks.push(buffer);
      size += buffer.length;
      if (size >= 4096) break;
    }
    start = excerpt(Buffer.concat(chunks));
  } catch {
    if (scope.reason !== undefined) throw scope.error();
  } finally {
    opened.close();
  }
  const text = opened.response.statusMessage ? ` ${opened.response.statusMessage}` : "";
  return new HttpError("HTTP_STATUS", `${scope.path.join(".")}: the server answered ${status}${text}${start ? `: ${start}` : ""}`, status);
}

/** The chunks of a body. Each chunk starts the idle time of the scope again. */
export async function* touching(body: Readable, scope: CallScope): AsyncGenerator<Uint8Array | string, void, undefined> {
  for await (const chunk of body) {
    scope.touch();
    yield chunk as Uint8Array | string;
  }
}
