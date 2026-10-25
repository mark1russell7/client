/**
 * The credentials of a network request (roadmap R18). A server transport reads them into
 * `ServerRequest.credentials`. It leaves the secret headers out of the metadata, so a handler and a
 * nested call do not see them. `ProcedureServer` examines them.
 *
 * This module imports no Node code: a server in a browser or a worker can use it too.
 */

import { LOCAL_MARKER, type Credentials, type RequestConnection } from "./types.js";

/**
 * The credentials of a local face (CLI-1): a call from this application, not from the network.
 * The server applies no token and no request hook to a request with them.
 *
 * Only these faces set them:
 * - A call in this process: a direct `handle()` of the code of the application.
 * - MCP over stdio: the peer is the parent process that started this process.
 * - A message port (`PortTransport`): only the holder of the other end of the port can send.
 *
 * A network face (HTTP, WebSocket, MCP over Streamable HTTP) never sets them. The marker key is a
 * symbol, so no request from the network can carry it.
 */
export const LOCAL_CREDENTIALS: Credentials = Object.freeze({ [LOCAL_MARKER]: true as const });

/** True when the credentials carry the local marker (CLI-1): the request comes from this application. */
export function isLocalCredentials(credentials: Credentials | undefined): boolean {
  return credentials?.[LOCAL_MARKER] === true;
}

/** The headers that carry a secret. They do not go into the metadata of a request. */
const SECRET_HEADERS: ReadonlySet<string> = new Set(["authorization", "proxy-authorization", "cookie", "x-api-key"]);

/**
 * True when a header carries a secret: a header of the default list (`Authorization`,
 * `Proxy-Authorization`, `Cookie`, `X-Api-Key`), or a header of `more`. The names are lower case.
 */
export function isSecretHeader(name: string, more?: ReadonlySet<string>): boolean {
  const key = name.toLowerCase();
  return SECRET_HEADERS.has(key) || (more?.has(key) ?? false);
}

/** This function gives a set of lower-case header names. */
export function headerNames(names: Iterable<string> | undefined): ReadonlySet<string> {
  const set = new Set<string>();
  for (const name of names ?? []) set.add(name.toLowerCase());
  return set;
}

/**
 * The headers without the secret ones, and without the headers that are not text. `secret` names
 * more headers that carry a secret, for example the token header of an application.
 */
export function withoutSecretHeaders(headers: Record<string, unknown>, secret?: Iterable<string>): Record<string, string> {
  const more = secret === undefined ? undefined : headerNames(secret);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!isSecretHeader(key, more) && typeof value === "string") out[key] = value;
  }
  return out;
}

/** The start of the header that `bearerOf` read before CLI-60: the scheme `Bearer` and one space. */
const BEARER_PREFIX = "Bearer ";

/**
 * The other forms of a bearer credential (RFC 7235 and RFC 6750, CLI-60). Such a form has the
 * scheme `Bearer` in any case, one or more spaces (`1*SP`) and the token. Spaces or tabs can come
 * after the token. The token has no whitespace (`token68`). A tab is not `1*SP`.
 */
const BEARER_CREDENTIAL = /^bearer +(\S+)[ \t]*$/i;

/**
 * The token of an `Authorization: Bearer <token>` header, or undefined. A header that starts
 * with `Bearer ` gives the rest of the header, as before CLI-60. A header with the scheme in
 * another case, for example `bearer`, gives the token after one or more spaces.
 */
export function bearerOf(header: unknown): string | undefined {
  if (typeof header !== "string") return undefined;
  // The old form keeps its old result, so each header that passed before gives the same token
  if (header.startsWith(BEARER_PREFIX)) return header.slice(BEARER_PREFIX.length);
  return BEARER_CREDENTIAL.exec(header)?.[1];
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

/** The text of a header value: a list of values becomes one text, with ", " between the values. */
function headerText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join(", ");
  return undefined;
}

/** This function decodes a cookie value. A value that is not valid URI encoding stays as it is. */
function decodeCookieValue(value: string): string {
  const unquoted = value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  try {
    return decodeURIComponent(unquoted);
  } catch {
    return unquoted;
  }
}

/**
 * The cookies of a `Cookie` header, by name. The function decodes each URI-encoded value when it
 * can. When two cookies have the same name, the first one stays: a browser sends the
 * cookie of the longest path first. A part without `=` is not a cookie.
 */
export function cookiesOf(header: unknown): Record<string, string> {
  const text = Array.isArray(header) ? header.filter((item): item is string => typeof item === "string").join("; ") : header;
  if (typeof text !== "string" || text === "") return {};
  const cookies = new Map<string, string>();
  for (const part of text.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === "" || cookies.has(name)) continue;
    cookies.set(name, decodeCookieValue(part.slice(eq + 1).trim()));
  }
  // fromEntries defines own properties: a cookie named "__proto__" changes no prototype
  return Object.fromEntries(cookies);
}

/**
 * The parts of a request URL: its path and its query. The function does not resolve the URL
 * against a host, so a path that starts with "//" stays a path.
 */
export function urlParts(url: string | undefined): { path: string; query: URLSearchParams } {
  let raw = url ?? "/";
  // The absolute form of a request line (a request through a proxy): the path and the query only
  if (!raw.startsWith("/") && /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const absolute = new URL(raw);
      raw = `${absolute.pathname}${absolute.search}`;
    } catch {
      // Not a URL: the text stays a path
    }
  }
  const mark = raw.indexOf("?");
  return mark === -1 ? { path: raw, query: new URLSearchParams() } : { path: raw.slice(0, mark), query: new URLSearchParams(raw.slice(mark + 1)) };
}

/** The first value of each query parameter, by name. */
export function queryRecord(query: URLSearchParams): Record<string, string> {
  const values = new Map<string, string>();
  for (const [key, value] of query) if (!values.has(key)) values.set(key, value);
  return Object.fromEntries(values);
}

/** The options of `requestCredentials`. */
export interface RequestCredentialsOptions {
  /**
   * The query parameter whose value is the bearer token of a request without an
   * `Authorization: Bearer` header. A browser WebSocket cannot set headers, so the WebSocket
   * server reads `token`. `false` reads no query parameter.
   * @default false
   */
  readonly tokenQuery?: string | false | undefined;
}

/** True for a port number of a socket: an integer from 0 to 65535. */
function isPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535;
}

/**
 * The connection of a network request (CLI-71): a frozen copy of the addresses and the ports of
 * its socket. The copy has only the fields that the socket has. A Unix socket or a named pipe
 * has no ports. No header goes into the copy.
 */
function connectionOf(socket: RequestConnection): RequestConnection {
  const connection: { remoteAddress?: string; remotePort?: number; localAddress?: string; localPort?: number } = {};
  const { remoteAddress, remotePort, localAddress, localPort } = socket;
  if (typeof remoteAddress === "string" && remoteAddress !== "") connection.remoteAddress = remoteAddress;
  if (isPort(remotePort)) connection.remotePort = remotePort;
  if (typeof localAddress === "string" && localAddress !== "") connection.localAddress = localAddress;
  if (isPort(localPort)) connection.localPort = localPort;
  return Object.freeze(connection);
}

/**
 * The credentials of a network request (roadmap R18): the bearer token, the cookies, each header
 * (the secret ones too) and the first value of each query parameter. The request hook of a server
 * (`principalOf`) reads them. They are not in the metadata, so a handler does not see them.
 *
 * With `request.socket` (the socket of a request of `node:http`), the credentials also have the
 * connection of the request (CLI-71): the addresses and the ports of that socket, as frozen data.
 */
export function requestCredentials(
  request: { headers: Record<string, unknown>; url?: string | undefined; socket?: RequestConnection | undefined },
  options: RequestCredentialsOptions = {}
): Credentials {
  const headers = new Map<string, string>();
  for (const [key, value] of Object.entries(request.headers)) {
    const text = headerText(value);
    if (text !== undefined) headers.set(key.toLowerCase(), text);
  }
  const { query } = urlParts(request.url);
  const fromHeader = bearerOf(headers.get("authorization"));
  const fromQuery = options.tokenQuery ? query.get(options.tokenQuery) ?? undefined : undefined;
  const bearer = fromHeader ?? fromQuery;
  return {
    ...(bearer !== undefined ? { bearer } : {}),
    cookies: cookiesOf(headers.get("cookie")),
    headers: Object.fromEntries(headers),
    query: queryRecord(query),
    ...(request.socket ? { connection: connectionOf(request.socket) } : {}),
  };
}
