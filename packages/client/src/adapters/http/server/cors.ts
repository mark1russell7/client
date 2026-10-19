/**
 * The CORS headers of a procedure server, without a framework. `procedureHandler` applies them to
 * the requests on its path. The Express shim `HttpServerTransport` applies them to each request of
 * its app, as before. `credentialedCors()` applies them to a route of the app next to the faces,
 * for example the auth routes, from the trusted origins of the host (CLI-49). This module imports
 * only the types of `node:http`.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { HTTPHeaders, HTTPMethod } from "../shared/index.js";
import { PROTOCOL_HEADER } from "../../../protocol.js";
import { NARROWING_HEADER } from "../../../procedures/narrowing.js";
import { toMs, type Duration } from "../../../duration.js";
import type { BrowserGuardOptions } from "../../../server/browser-guard.js";

/** The CORS options of a procedure server. */
export interface CorsOptions {
  /**
   * The origins that can read the responses: `"*"`, one origin, a list, or a function that
   * decides for each origin. A response names the origin of the request when the origin is
   * permitted, with `Vary: Origin`.
   * @default "*"
   */
  readonly origin?: string | readonly string[] | ((origin: string) => boolean) | undefined;
  /** The methods of `Access-Control-Allow-Methods`. @default GET, POST, PUT, DELETE, PATCH, OPTIONS */
  readonly methods?: readonly string[] | undefined;
  /** The request headers of `Access-Control-Allow-Headers`. @default the headers of `HttpTransport` */
  readonly allowedHeaders?: readonly string[] | undefined;
  /** The response headers that a page can read (`Access-Control-Expose-Headers`). @default none */
  readonly exposedHeaders?: readonly string[] | undefined;
  /**
   * True: a page can send cookies (`fetch` with `credentials: "include"`). The response then has
   * `Access-Control-Allow-Credentials: true`. A browser refuses `"*"` with credentials, so give the
   * origins.
   */
  readonly credentials?: boolean | undefined;
  /** The time that a browser keeps the answer to a preflight request (`Access-Control-Max-Age`). */
  readonly maxAge?: Duration | undefined;
}

/** The request headers that `HttpTransport` sends: the default `allowedHeaders`. */
export const DEFAULT_CORS_HEADERS: readonly string[] = Object.freeze([
  "Content-Type",
  "Accept",
  HTTPHeaders.AUTHORIZATION,
  HTTPHeaders.API_KEY,
  HTTPHeaders.REQUEST_ID,
  HTTPHeaders.TRACE_ID,
  HTTPHeaders.SPAN_ID,
  HTTPHeaders.PARENT_SPAN_ID,
  "traceparent",
  PROTOCOL_HEADER,
  HTTPHeaders.METADATA,
  // The narrowing key of a call (CLI-30)
  NARROWING_HEADER,
  "collection",
  "collectionName",
  "database",
]);

/** The methods of the default `Access-Control-Allow-Methods`. */
export const DEFAULT_CORS_METHODS: readonly string[] = Object.freeze([
  HTTPMethod.GET,
  HTTPMethod.POST,
  HTTPMethod.PUT,
  HTTPMethod.DELETE,
  HTTPMethod.PATCH,
  HTTPMethod.OPTIONS,
]);

/** The CORS options with their defaults, ready for each request. */
export interface CorsPolicy {
  /** The permitted origin to send back for a request origin, or undefined for none. */
  readonly allowOrigin: (requestOrigin: string | undefined) => string | undefined;
  /** True when the permitted origin depends on the request: the response gets `Vary: Origin`. */
  readonly varies: boolean;
  readonly methods: string | undefined;
  readonly allowedHeaders: string | undefined;
  readonly exposedHeaders: string | undefined;
  readonly credentials: boolean;
  /** The value of `Access-Control-Max-Age` in seconds, or undefined. */
  readonly maxAge: string | undefined;
  /** True: a response for an origin that is not permitted gets no CORS header (`credentialedCors()`). */
  readonly permittedOnly?: boolean | undefined;
}

/**
 * This function makes the CORS policy of the options. `defaultCredentials` is the default of the
 * `credentials` option.
 */
export function corsPolicy(options: CorsOptions, defaultCredentials: boolean): CorsPolicy {
  const origin = options.origin ?? "*";
  const allowOrigin = (requestOrigin: string | undefined): string | undefined => {
    if (origin === "*") return "*";
    if (requestOrigin === undefined) return undefined;
    if (typeof origin === "function") return origin(requestOrigin) ? requestOrigin : undefined;
    const list: readonly string[] = typeof origin === "string" ? [origin] : origin;
    return list.includes(requestOrigin) ? requestOrigin : undefined;
  };
  const join = (list: readonly string[] | undefined): string | undefined => (list === undefined || list.length === 0 ? undefined : list.join(", "));
  const maxAgeMs = options.maxAge === undefined ? undefined : toMs(options.maxAge, "cors.maxAge");
  return {
    allowOrigin,
    varies: origin !== "*",
    methods: join("methods" in options ? options.methods : DEFAULT_CORS_METHODS),
    allowedHeaders: join("allowedHeaders" in options ? options.allowedHeaders : DEFAULT_CORS_HEADERS),
    exposedHeaders: join(options.exposedHeaders),
    credentials: options.credentials ?? defaultCredentials,
    maxAge: maxAgeMs === undefined || maxAgeMs <= 0 ? undefined : String(Math.floor(maxAgeMs / 1000)),
  };
}

/** This function adds a value to the `Vary` header of a response, one time. */
function vary(res: ServerResponse, field: string): void {
  const current = res.getHeader("Vary");
  const text = Array.isArray(current) ? current.join(", ") : current === undefined ? "" : String(current);
  const fields = text.split(",").map((part) => part.trim().toLowerCase());
  if (fields.includes("*") || fields.includes(field.toLowerCase())) return;
  res.setHeader("Vary", text.trim() === "" ? field : `${text}, ${field}`);
}

/**
 * This function sets the CORS headers of a response. It gives true for a preflight request
 * (`OPTIONS`): the function then ends the response with 204.
 */
export function applyCors(req: IncomingMessage, res: ServerResponse, policy: CorsPolicy): boolean {
  const requestOrigin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const allowed = policy.allowOrigin(requestOrigin);
  if (policy.varies) vary(res, "Origin");
  if (allowed === undefined && policy.permittedOnly === true) {
    // An origin that is not permitted gets no CORS header, and its preflight ends here
    if (req.method !== "OPTIONS") return false;
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (allowed !== undefined) res.setHeader("Access-Control-Allow-Origin", allowed);
  if (policy.methods !== undefined) res.setHeader("Access-Control-Allow-Methods", policy.methods);
  if (policy.allowedHeaders !== undefined) res.setHeader("Access-Control-Allow-Headers", policy.allowedHeaders);
  if (policy.exposedHeaders !== undefined) res.setHeader("Access-Control-Expose-Headers", policy.exposedHeaders);
  if (policy.credentials) res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method !== "OPTIONS") return false;
  if (policy.maxAge !== undefined) res.setHeader("Access-Control-Max-Age", policy.maxAge);
  res.statusCode = 204;
  res.end();
  return true;
}

/**
 * The origins that the CORS options permit, for the browser checks: a page that CORS lets read the
 * response can also send a call. Without CORS, no other origin can send a call.
 */
export function corsOrigins(cors: CorsOptions | undefined): readonly string[] | "*" | ((origin: string) => boolean) {
  if (!cors) return [];
  const origin = cors.origin ?? "*";
  if (origin === "*") return "*";
  if (typeof origin === "function") return origin;
  return typeof origin === "string" ? [origin] : origin;
}

/** The options of `credentialedCors()`: the CORS options, less the origins and the credentials. */
export type CredentialedCorsOptions = Omit<CorsOptions, "origin" | "credentials">;

/**
 * This function gives the credentialed CORS of the trusted origins of a host (CLI-49), for a
 * route of the app next to the faces, for example the auth routes. The origins are the
 * `allowedOrigins` of the browser checks, so one list drives the faces and the routes of the app.
 *
 * - A response for a trusted origin names that one origin, with
 *   `Access-Control-Allow-Credentials: true` and `Vary: Origin`.
 * - A response for another origin, or for a request without an origin, gets no CORS header.
 * - The handler ends each preflight request (`OPTIONS`) with 204 and gives true. A preflight of a
 *   trusted origin gets the permitted methods and headers. For another request, it gives false.
 *
 * The function throws for `"*"`: a browser refuses `"*"` with credentials, and each site could
 * then send the cookies of the user (CSRF). Without origins, no other origin gets CORS.
 */
export function credentialedCors(
  allowedOrigins: BrowserGuardOptions["allowedOrigins"],
  options: CredentialedCorsOptions = {},
): (req: IncomingMessage, res: ServerResponse) => boolean {
  if (allowedOrigins === "*") {
    throw new Error('Credentialed CORS needs a list or a function of the trusted origins, not "*": each site could send the cookies of the user (CSRF)');
  }
  const policy: CorsPolicy = { ...corsPolicy({ ...options, origin: allowedOrigins ?? [], credentials: true }, true), permittedOnly: true };
  return (req, res) => applyCors(req, res, policy);
}
