/**
 * Type definitions of the procedures of this package
 *
 * mark procedure new adds the types of each new procedure here. The zod schemas are in
 * `module.ts`: an exported schema needs a written type (isolatedDeclarations).
 */

/** A JSON value. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** The methods of `http.request`. */
export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

/** The fields of a request that each procedure has. */
export interface HttpTarget {
  /** The URL: `http:` or `https:`. */
  url: string;
  /** The headers of the request. */
  headers?: Record<string, string> | undefined;
  /** More parameters for the query of the URL. A list gives the parameter more than one time. */
  query?: Record<string, string | number | boolean | Array<string | number | boolean>> | undefined;
}

// =============================================================================
// http.request Types - Send an HTTP request and give the status, the headers and the body
// =============================================================================

export interface HttpRequestInput extends HttpTarget {
  method?: HttpMethod | undefined;
  /** A body of text. */
  body?: string | undefined;
  /** A body of JSON: the procedure sets `content-type: application/json`. */
  json?: unknown;
  /** A body of bytes in base64. */
  bodyBase64?: string | undefined;
  /** The form of the body of the response: text (the default), parsed JSON, or bytes in base64. */
  responseType?: "text" | "json" | "bytes" | undefined;
  /** The time of the whole call, in milliseconds. The default is 30000. */
  timeoutMs?: number | undefined;
  /** The largest body of the response, in bytes. The limit of the module is the maximum. */
  maxResponseBytes?: number | undefined;
  /** What to do with a redirect: follow it (the default), give it (`manual`), or fail (`error`). */
  redirect?: "follow" | "manual" | "error" | undefined;
  /** The most redirects that the call follows. The default is 5. */
  maxRedirects?: number | undefined;
}

export interface HttpRequestOutput {
  status: number;
  statusText: string;
  /** True for a status in 200 to 299. */
  ok: boolean;
  /** The URL of the response: the last URL after the redirects. */
  url: string;
  /** True when the call followed one or more redirects. */
  redirected: boolean;
  /** The headers of the response, with names in lowercase. `set-cookie` is a list. */
  headers: Record<string, string | string[]>;
  /** The body: text, parsed JSON (null for an empty body), or bytes in base64. */
  body: unknown;
  /** The size of the body in bytes, after the content encoding. */
  bytes: number;
}

// =============================================================================
// http.json Types - Send a GET or a POST of JSON and give the parsed JSON response
// =============================================================================

export interface HttpJsonInput extends HttpTarget {
  /** GET, or POST. The default is POST with `json`, and GET without it. */
  method?: "GET" | "POST" | undefined;
  /** The JSON body of a POST. */
  json?: unknown;
  /** The time of the whole call, in milliseconds. The default is 30000. */
  timeoutMs?: number | undefined;
  /** The largest body of the response, in bytes. The limit of the module is the maximum. */
  maxResponseBytes?: number | undefined;
  /** True (the default): a status outside 200 to 299 is an error. False: the output has it. */
  failOnStatus?: boolean | undefined;
}

export interface HttpJsonOutput {
  status: number;
  ok: boolean;
  url: string;
  headers: Record<string, string | string[]>;
  /** The parsed body. An empty body gives null. An error status with a body that is not JSON gives its text. */
  data: unknown;
}

// =============================================================================
// http.ndjson Types - Read an NDJSON response as a stream of parsed lines
// =============================================================================

export interface HttpStreamInput extends HttpTarget {
  /** The time of the whole stream, in milliseconds. The default is no limit. */
  timeoutMs?: number | undefined;
  /** The longest time without data, in milliseconds. The default is no limit. */
  idleTimeoutMs?: number | undefined;
}

export interface HttpNdjsonInput extends HttpStreamInput {
  /** The largest line, in bytes. The default is 1 MiB. */
  maxLineBytes?: number | undefined;
}

/** One item of `http.ndjson`: the JSON value of one line. */
export type HttpNdjsonOutput = unknown;

// =============================================================================
// http.sse Types - Read a stream of server-sent events
// =============================================================================

export interface HttpSseInput extends HttpStreamInput {
  /** The `Last-Event-ID` header: the server continues after this event. */
  lastEventId?: string | undefined;
  /** The largest event, in bytes. The default is 1 MiB. */
  maxEventBytes?: number | undefined;
}

/** One item of `http.sse`: one event. */
export interface HttpSseOutput {
  event: string;
  data: string;
  id?: string | undefined;
  retry?: number | undefined;
}
