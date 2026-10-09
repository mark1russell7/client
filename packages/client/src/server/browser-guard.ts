/**
 * Checks of requests that a web browser can send to a procedure server.
 *
 * A server serves its whole registry, often with `shell.*` in it, and a web page that the user
 * opens can send requests to `127.0.0.1`. Before, the HTTP server transport read any request
 * body as JSON, so a "simple" cross-site POST (`Content-Type: text/plain`, no CORS preflight)
 * ran any procedure, and the WebSocket server accepted a connection from any page
 * (cross-site WebSocket hijacking). The checks here are on by default in both transports:
 *
 * - A connection that arrives on a loopback address must name a loopback host in its `Host`
 *   header. A DNS rebinding attack sends the name of the attacker's site.
 * - A browser request (an `Origin` header) must come from the server's own origin, or from an
 *   origin in `allowedOrigins`.
 * - A request that the browser marks `Sec-Fetch-Site: cross-site` or `same-site` and that has
 *   no allowed origin is refused (an image tag or a form sends no `Origin` for a GET).
 * - HTTP only: a procedure call by GET or HEAD is refused unless `allowGet` is true, and a
 *   request body must be JSON.
 */

import type { IncomingHttpHeaders } from "node:http";

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** The options of the browser checks of a server transport. */
export interface BrowserGuardOptions {
  /**
   * The web origins that can call the server, besides its own origin. `"*"` allows every
   * origin. A function decides for each origin.
   * @default [] (only the server's own origin)
   */
  allowedOrigins?: readonly string[] | "*" | ((origin: string) => boolean) | undefined;
  /**
   * The host names that a request on a loopback address can name in its `Host` header,
   * besides the loopback names. `"*"` turns the check off.
   * @default [] (only `localhost`, `127.0.0.1` and `[::1]`)
   */
  allowedHosts?: readonly string[] | "*" | undefined;
  /**
   * HTTP only: accept procedure calls by GET or HEAD. A RESTful URL strategy needs this. A GET
   * is a request that any page can send (an image tag), so it is off by default.
   * @default false
   */
  allowGet?: boolean | undefined;
}

/** The parts of an incoming request that the checks read. */
export interface GuardedRequest {
  method?: string | undefined;
  headers: IncomingHttpHeaders;
  socket?: { localAddress?: string | undefined } | undefined;
}

/** The result of the checks: the request passes, or the HTTP status and the error to send. */
export type GuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 403 | 405 | 415; readonly code: string; readonly message: string };

/** True for a host name or a bind address that only this computer can reach. */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_NAMES.has(host.toLowerCase());
}

/** True for a local socket address on the loopback interface (IPv4, IPv6, or IPv4 in IPv6). */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const plain = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  return plain === "::1" || plain.startsWith("127.");
}

/** The name of a Host header without its port: "localhost:3000" gives "localhost", "[::1]:80" gives "[::1]". */
export function hostNameOf(header: string | undefined): string {
  if (!header) return "";
  if (header.startsWith("[")) return header.slice(0, header.indexOf("]") + 1).toLowerCase();
  return (header.split(":")[0] ?? "").toLowerCase();
}

function originAllowedBy(origin: string, allowed: BrowserGuardOptions["allowedOrigins"]): boolean {
  if (allowed === "*") return true;
  if (typeof allowed === "function") return allowed(origin);
  return (allowed ?? []).includes(origin);
}

/** True when the origin is the origin of the server that the request names in its Host header. */
function sameOrigin(origin: string, hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  try {
    return new URL(origin).host.toLowerCase() === hostHeader.toLowerCase();
  } catch {
    return false;
  }
}

/** True for a media type of JSON: `application/json` or a `+json` type. */
function isJsonType(contentType: string | undefined): boolean {
  const type = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  return type === "application/json" || type.endsWith("+json");
}

/** True when the request has a body: a `Content-Length` above 0, or a chunked body. */
function hasBody(headers: IncomingHttpHeaders): boolean {
  const length = Number(headers["content-length"] ?? 0);
  return length > 0 || headers["transfer-encoding"] !== undefined;
}

/**
 * The checks of the host, the origin and the fetch site, for HTTP and WebSocket requests.
 * `http` adds the checks of the method and the body.
 */
export function checkBrowserRequest(
  req: GuardedRequest,
  options: BrowserGuardOptions = {},
  http = false
): GuardResult {
  const { headers } = req;

  // DNS rebinding: a request on a loopback address must name a loopback host
  if (options.allowedHosts !== "*" && isLoopbackAddress(req.socket?.localAddress)) {
    const name = hostNameOf(headers.host);
    if (!LOOPBACK_NAMES.has(name) && !(options.allowedHosts ?? []).includes(name)) {
      return { ok: false, status: 403, code: "FORBIDDEN_HOST", message: `Forbidden: the host "${name}" is not allowed` };
    }
  }

  const origin = typeof headers.origin === "string" ? headers.origin : undefined;
  if (origin !== undefined) {
    if (!sameOrigin(origin, headers.host) && !originAllowedBy(origin, options.allowedOrigins)) {
      return { ok: false, status: 403, code: "FORBIDDEN_ORIGIN", message: `Forbidden: the origin "${origin}" is not allowed` };
    }
  } else {
    const site = headers["sec-fetch-site"];
    if ((site === "cross-site" || site === "same-site") && options.allowedOrigins !== "*") {
      return { ok: false, status: 403, code: "FORBIDDEN_ORIGIN", message: "Forbidden: a request from another site" };
    }
  }

  if (http) {
    const method = (req.method ?? "GET").toUpperCase();
    if ((method === "GET" || method === "HEAD") && !options.allowGet) {
      return { ok: false, status: 405, code: "METHOD_NOT_ALLOWED", message: "Call a procedure with POST" };
    }
    if (hasBody(headers) && !isJsonType(headers["content-type"])) {
      return { ok: false, status: 415, code: "UNSUPPORTED_MEDIA_TYPE", message: "The request body must be JSON (Content-Type: application/json)" };
    }
  }

  return { ok: true };
}
