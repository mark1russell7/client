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
 * - A request with ambient credentials (the cookies that a browser sends by itself) is trusted
 *   only from a named origin. `"*"` does not open the origin check for it (CSRF). A list or a
 *   function of origins still does.
 *
 * Each refusal is the error `FORBIDDEN` of wire v1, with the status 403 and a reason (CLI-4).
 */

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

/**
 * The headers of a request, by lower-case name. The type is structural, so the root names no Node
 * module (CLI-61). `IncomingHttpHeaders` of `node:http` agrees with it.
 */
export interface GuardedHeaders {
  readonly [name: string]: string | string[] | undefined;
  readonly host?: string | undefined;
  readonly origin?: string | undefined;
  readonly cookie?: string | undefined;
  readonly "content-type"?: string | undefined;
  readonly "content-length"?: string | undefined;
  readonly "transfer-encoding"?: string | undefined;
}

/** The parts of an incoming request that the checks read. An `IncomingMessage` of `node:http` agrees with it. */
export interface GuardedRequest {
  method?: string | undefined;
  headers: GuardedHeaders;
  socket?: { localAddress?: string | undefined } | undefined;
}

/**
 * The result of the checks: the request passes, or the HTTP status and the error to send.
 *
 * A refusal is the error `FORBIDDEN` of wire v1 with the status 403. Its `reason` tells which
 * check refused the request. Before CLI-4, the checks gave the codes `FORBIDDEN_HOST`,
 * `FORBIDDEN_ORIGIN`, `METHOD_NOT_ALLOWED` (405) and `UNSUPPORTED_MEDIA_TYPE` (415).
 */
export type GuardResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly status: 403;
      readonly code: "FORBIDDEN";
      /** The check that refused the request, as in `documentation/WIRE-PROTOCOL.md`. */
      readonly reason: "host-header-not-allowed" | "origin-not-allowed" | "method-not-allowed" | "media-type-not-allowed";
      readonly message: string;
    };

/** The refusal of a check: the error `FORBIDDEN` of wire v1 with its reason (CLI-4). */
function refusal(reason: Extract<GuardResult, { ok: false }>["reason"], message: string): Extract<GuardResult, { ok: false }> {
  return { ok: false, status: 403, code: "FORBIDDEN", reason, message };
}

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

function originAllowedBy(origin: string, allowed: BrowserGuardOptions["allowedOrigins"], ambient: boolean): boolean {
  // "*" names no origin: ambient credentials are not trusted from it
  if (allowed === "*") return !ambient;
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
function hasBody(headers: GuardedHeaders): boolean {
  const length = Number(headers["content-length"] ?? 0);
  return length > 0 || headers["transfer-encoding"] !== undefined;
}

/**
 * True when a request carries ambient credentials: a `Cookie` header, which a browser sends by
 * itself, also for a request that another site starts.
 */
export function hasAmbientCredentials(headers: GuardedHeaders): boolean {
  const cookie = headers.cookie;
  return typeof cookie === "string" && cookie.trim() !== "";
}

/**
 * True when a face trusts a request only from a named origin. This is so when the server reads
 * cookies for each request (`"always"`), or when the request carries a cookie that an auth path can
 * read. `cookiesNamed` is true for a face that trusts no cookie from
 * an origin that is not named, with or without an auth path.
 *
 * @internal
 */
export function needsNamedOrigin(mode: "always" | "cookies" | undefined, headers: GuardedHeaders, cookiesNamed: boolean): boolean {
  return mode === "always" || (hasAmbientCredentials(headers) && (cookiesNamed || mode !== undefined));
}

/**
 * This function refuses a face whose server reads cookies for each request (`principalOf`) while
 * its browser checks permit each origin (`"*"`). Each site could then send a request with the cookies
 * of the user (CSRF).
 *
 * @internal
 */
export function assertNamedOrigins(face: string, mode: "always" | "cookies" | undefined, allowedOrigins: BrowserGuardOptions["allowedOrigins"], originOption: string): void {
  if (mode !== "always" || allowedOrigins !== "*") return;
  throw new Error(
    `${face}: the request hook principalOf reads the cookies of each request, and the origin "*" lets each site send them (CSRF). Give ${originOption} or allowedOrigins a list or a function of the origins that can call.`
  );
}

/**
 * The checks of the host, the origin and the fetch site, for HTTP and WebSocket requests.
 * `http` adds the checks of the method and the body. `ambient` is true when the server can trust
 * ambient credentials (cookies) for the request. Then `"*"` does not permit another origin. Only a
 * named origin (a list or a function) does.
 */
export function checkBrowserRequest(
  req: GuardedRequest,
  options: BrowserGuardOptions = {},
  http = false,
  ambient = false
): GuardResult {
  const { headers } = req;

  // DNS rebinding: a request on a loopback address must name a loopback host
  if (options.allowedHosts !== "*" && isLoopbackAddress(req.socket?.localAddress)) {
    const name = hostNameOf(headers.host);
    if (!LOOPBACK_NAMES.has(name) && !(options.allowedHosts ?? []).includes(name)) {
      return refusal("host-header-not-allowed", `Forbidden: the host "${name}" is not allowed`);
    }
  }

  const origin = typeof headers.origin === "string" ? headers.origin : undefined;
  if (origin !== undefined) {
    if (!sameOrigin(origin, headers.host) && !originAllowedBy(origin, options.allowedOrigins, ambient)) {
      return refusal("origin-not-allowed", `Forbidden: the origin "${origin}" is not allowed`);
    }
  } else {
    const site = headers["sec-fetch-site"];
    if ((site === "cross-site" || site === "same-site") && (options.allowedOrigins !== "*" || ambient)) {
      return refusal("origin-not-allowed", "Forbidden: a request from another site");
    }
  }

  if (http) {
    const method = (req.method ?? "GET").toUpperCase();
    if ((method === "GET" || method === "HEAD") && !options.allowGet) {
      return refusal("method-not-allowed", "Forbidden: call a procedure with POST");
    }
    if (hasBody(headers) && !isJsonType(headers["content-type"])) {
      return refusal("media-type-not-allowed", "Forbidden: the request body must be JSON (Content-Type: application/json)");
    }
  }

  return { ok: true };
}
