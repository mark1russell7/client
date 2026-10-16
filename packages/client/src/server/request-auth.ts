/**
 * The credentials of a network request (roadmap R18). A server transport reads them into
 * `ServerRequest.credentials`, and leaves the secret headers out of the metadata, so a handler
 * and a nested call do not see them. `ProcedureServer` examines them.
 */

import type { Credentials } from "./types.js";

/** The headers that carry a secret. They do not go into the metadata of a request. */
const SECRET_HEADERS = new Set(["authorization", "proxy-authorization", "cookie", "x-api-key"]);

/** The headers without the secret ones, and without the headers that are not text. */
export function withoutSecretHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!SECRET_HEADERS.has(key.toLowerCase()) && typeof value === "string") out[key] = value;
  }
  return out;
}

/** The token of an `Authorization: Bearer <token>` header, or undefined. */
export function bearerOf(header: unknown): string | undefined {
  return typeof header === "string" && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

/**
 * The credentials of a request or of a WebSocket upgrade: the bearer token of its
 * `Authorization` header, or else of its `token` query (a browser WebSocket cannot set headers).
 */
export function credentialsOf(request: { headers: Record<string, unknown>; url?: string | undefined }): Credentials {
  const bearer = bearerOf(request.headers["authorization"]);
  if (bearer !== undefined) return { bearer };
  const query = new URL(request.url ?? "/", "http://localhost").searchParams.get("token");
  return query === null ? {} : { bearer: query };
}
