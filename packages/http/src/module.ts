/**
 * The procedures of @procedures/http as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/http
 *
 * `httpModule` reaches each public host and refuses the other addresses. `createHttpModule()`
 * gives the same procedures with another host policy or other size limits (roadmap R38).
 */

import { z } from "zod";
import {
  defineModule,
  registerModules,
  PROCEDURE_REGISTRY,
  createProcedure,
  zodAdapter,
  type AnyProcedure,
  type Effects,
  type ProcedureHandler,
  type ProcedureModule,
  type ProcedureRegistry,
} from "@procedures/client";
import { DEFAULT_MAX_BYTES, DEFAULT_SETTINGS, type HttpSettings } from "./exchange.js";
import { createHostPolicy, type HostPolicyOptions } from "./policy.js";
import type { ScopeContext } from "./scope.js";
import { httpRequest } from "./procedures/http/request.js";
import { httpJson } from "./procedures/http/json.js";
import { httpNdjson } from "./procedures/http/ndjson.js";
import { httpSse } from "./procedures/http/sse.js";
import type {
  HttpJsonInput,
  HttpJsonOutput,
  HttpNdjsonInput,
  HttpNdjsonOutput,
  HttpRequestInput,
  HttpRequestOutput,
  HttpSseInput,
  HttpSseOutput,
} from "./types.js";

// =============================================================================
// Schemas
// =============================================================================

const url = z.url({ protocol: /^https?$/ }).describe("The URL: http: or https:");
const headers = z.record(z.string(), z.string()).optional().describe("The headers of the request");
const queryValue = z.union([z.string(), z.number(), z.boolean()]);
const query = z
  .record(z.string(), z.union([queryValue, z.array(queryValue)]))
  .optional()
  .describe("More parameters for the query of the URL. A list gives the parameter more than one time");
/** A time in milliseconds: at most 24 hours. */
const milliseconds = (description: string) => z.number().int().positive().max(86_400_000).optional().describe(description);
const byteLimit = (description: string) => z.number().int().positive().optional().describe(description);
const maxResponseBytes = byteLimit("The largest body of the response, in bytes. The default and the maximum is the limit of the module (10 MiB)");
const headerRecord = z.record(z.string(), z.union([z.string(), z.array(z.string())])).describe("The headers of the response, with names in lowercase");

const HttpRequestInputSchema = z.object({
  url,
  method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).optional().describe("The method (default: GET)"),
  headers,
  query,
  body: z.string().optional().describe("A body of text"),
  json: z.unknown().optional().describe("A body of JSON: the procedure sets content-type: application/json"),
  bodyBase64: z.base64().optional().describe("A body of bytes in base64"),
  responseType: z.enum(["text", "json", "bytes"]).optional().describe("The form of the body of the response: text (default), json, or bytes in base64"),
  timeoutMs: milliseconds("The time of the whole call, in milliseconds (default: 30000)"),
  maxResponseBytes,
  redirect: z.enum(["follow", "manual", "error"]).optional().describe("What to do with a redirect: follow it (default), give it (manual), or fail (error)"),
  maxRedirects: z.number().int().min(0).max(20).optional().describe("The most redirects that the call follows (default: 5)"),
});

const HttpRequestOutputSchema = z.object({
  status: z.number().int().describe("The status of the response"),
  statusText: z.string().describe("The reason phrase of the status"),
  ok: z.boolean().describe("True for a status in 200 to 299"),
  url: z.string().describe("The URL of the response: the last URL after the redirects"),
  redirected: z.boolean().describe("True when the call followed a redirect"),
  headers: headerRecord,
  body: z.unknown().describe("The body: text, parsed JSON (null when empty), or bytes in base64"),
  bytes: z.number().int().describe("The size of the body in bytes, after the content encoding"),
});

const HttpJsonInputSchema = z.object({
  url,
  method: z.enum(["GET", "POST"]).optional().describe("GET or POST (default: POST with json, GET without it)"),
  headers,
  query,
  json: z.unknown().optional().describe("The JSON body of a POST"),
  timeoutMs: milliseconds("The time of the whole call, in milliseconds (default: 30000)"),
  maxResponseBytes,
  failOnStatus: z.boolean().optional().describe("True (default): a status outside 200 to 299 is an error. False: the output has the status"),
});

const HttpJsonOutputSchema = z.object({
  status: z.number().int().describe("The status of the response"),
  ok: z.boolean().describe("True for a status in 200 to 299"),
  url: z.string().describe("The URL of the response: the last URL after the redirects"),
  headers: headerRecord,
  data: z.unknown().describe("The parsed body. An empty body gives null. An error status with a body that is not JSON gives its text"),
});

const streamFields = {
  url,
  headers,
  query,
  timeoutMs: milliseconds("The time of the whole stream, in milliseconds (default: no limit)"),
  idleTimeoutMs: milliseconds("The longest time without data, in milliseconds (default: no limit)"),
};

const HttpNdjsonInputSchema = z.object({
  ...streamFields,
  maxLineBytes: byteLimit("The largest line, in bytes (default: 1 MiB)"),
});

const HttpNdjsonOutputSchema = z.unknown().describe("The JSON value of one line");

const HttpSseInputSchema = z.object({
  ...streamFields,
  lastEventId: z.string().optional().describe("The Last-Event-ID header: the server continues after this event"),
  maxEventBytes: byteLimit("The largest event, in bytes (default: 1 MiB)"),
});

const HttpSseOutputSchema = z.object({
  event: z.string().describe("The type of the event (default: message)"),
  data: z.string().describe("The data of the event: its data lines joined with LF"),
  id: z.string().optional().describe("The last event ID of the stream"),
  retry: z.number().int().optional().describe("The reconnection time that the event gave, in milliseconds"),
});

// =============================================================================
// Procedures
// =============================================================================

/** The effects of a request with any method: it reads from the network and can change remote data. */
const NETWORK_WRITE: Effects = { reads: ["network"], writes: ["network"] };

/** The effects of a GET: it reads from the network and changes nothing. */
const NETWORK_READ: Effects = { reads: ["network"], writes: [] };

/** The four procedures, with handlers that use the settings. */
function httpProcedures(settings: HttpSettings): AnyProcedure[] {
  const httpRequestProcedure = createProcedure()
    .path(["http", "request"])
    .input(zodAdapter<HttpRequestInput>(HttpRequestInputSchema))
    .output(zodAdapter<HttpRequestOutput>(HttpRequestOutputSchema))
    .meta({
      description: "Send an HTTP request and give the status, the headers and the body",
      args: ["url"],
      shorts: { method: "X", responseType: "r", timeoutMs: "t" },
      output: "json",
      // Each method: a POST, a PUT or a DELETE can change or delete remote data
      effects: NETWORK_WRITE,
    })
    .handler(async (input: HttpRequestInput, ctx): Promise<HttpRequestOutput> => httpRequest(input, ctx, settings))
    .build();

  const httpJsonProcedure = createProcedure()
    .path(["http", "json"])
    .input(zodAdapter<HttpJsonInput>(HttpJsonInputSchema))
    .output(zodAdapter<HttpJsonOutput>(HttpJsonOutputSchema))
    .meta({
      description: "Send a GET or a POST of JSON and give the parsed JSON response",
      args: ["url"],
      shorts: { method: "X", timeoutMs: "t" },
      output: "json",
      // A POST can change remote data
      effects: NETWORK_WRITE,
    })
    .handler(async (input: HttpJsonInput, ctx): Promise<HttpJsonOutput> => httpJson(input, ctx, settings))
    .build();

  const httpNdjsonProcedure = createProcedure()
    .path(["http", "ndjson"])
    .input(zodAdapter<HttpNdjsonInput>(HttpNdjsonInputSchema))
    .output(zodAdapter<HttpNdjsonOutput>(HttpNdjsonOutputSchema))
    .meta({
      description: "Read an NDJSON response as a stream of parsed lines",
      args: ["url"],
      shorts: { timeoutMs: "t" },
      output: "json",
      streaming: true,
      // A server can send lines without an end (a watch, a feed): roadmap R15
      stream: { unbounded: true },
      // Only a GET
      effects: NETWORK_READ,
    })
    // The promise gives the stream after the status: invokeProcedure reads a returned async
    // iterable as a stream, and the handler types of the core do not describe that case
    .handler(((input: HttpNdjsonInput, ctx: ScopeContext) => httpNdjson(input, ctx, settings)) as unknown as ProcedureHandler<HttpNdjsonInput, HttpNdjsonOutput>)
    .build();

  const httpSseProcedure = createProcedure()
    .path(["http", "sse"])
    .input(zodAdapter<HttpSseInput>(HttpSseInputSchema))
    .output(zodAdapter<HttpSseOutput>(HttpSseOutputSchema))
    .meta({
      description: "Read a stream of server-sent events",
      args: ["url"],
      shorts: { timeoutMs: "t" },
      output: "json",
      streaming: true,
      // An event stream can run without an end: roadmap R15
      stream: { unbounded: true },
      // Only a GET
      effects: NETWORK_READ,
    })
    .handler(((input: HttpSseInput, ctx: ScopeContext) => httpSse(input, ctx, settings)) as unknown as ProcedureHandler<HttpSseInput, HttpSseOutput>)
    .build();

  return [httpRequestProcedure, httpJsonProcedure, httpNdjsonProcedure, httpSseProcedure];
}

/**
 * The module of this package, for `createRegistry()`: its procedures as data. It reaches each
 * public host and refuses loopback, private, link-local and the other special addresses.
 * Importing this file registers nothing.
 */
export const httpModule: ProcedureModule = defineModule("@procedures/http", httpProcedures(DEFAULT_SETTINGS));

export default httpModule;

/** The options of `createHttpModule()`: the host policy and the size limits of the host. */
export interface HttpModuleOptions extends HostPolicyOptions {
  /** The largest body of a request, in bytes. The default is 10 MiB. */
  readonly maxRequestBytes?: number | undefined;
  /** The largest body of a response, in bytes: the maximum of each input. The default is 10 MiB. */
  readonly maxResponseBytes?: number | undefined;
}

/**
 * This function gives the module of this package with a host policy and size limits. Without
 * options, it gives `httpModule`. A host gives it to `createRegistry()` before its bundles, so it
 * replaces the `httpModule` that a bundle requires (the first module of a name counts). A bad
 * entry of `allow` throws here.
 *
 * ```ts
 * createRegistry(createHttpModule({ allow: ["localhost:11434", "10.0.0.0/8"] }));
 * ```
 */
export function createHttpModule(options: HttpModuleOptions = {}): ProcedureModule {
  if (Object.values(options).every((value) => value === undefined)) return httpModule;
  const settings: HttpSettings = {
    policy: createHostPolicy(options),
    maxRequestBytes: options.maxRequestBytes ?? DEFAULT_MAX_BYTES,
    maxResponseBytes: options.maxResponseBytes ?? DEFAULT_MAX_BYTES,
  };
  return defineModule("@procedures/http", httpProcedures(settings));
}

/**
 * This function registers the procedures of @procedures/http in a registry. The default is the
 * global registry. The options are the options of `createHttpModule()`.
 */
export function registerHttpProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY, options: HttpModuleOptions = {}): void {
  registerModules(registry, [createHttpModule(options)]);
}
