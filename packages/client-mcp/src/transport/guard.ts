/**
 * The checks of a request to the Streamable HTTP face (CLI-35), in one place.
 *
 * The `handle` of the face calls `guardMcpRequest` before a request reaches the MCP SDK. The face
 * mounts on more than one kind of listener, so the listener adds no second check for its path.
 *
 * - The checks of a web browser (`checkBrowserRequest` of the core): a request on a loopback
 *   address names a loopback host or an allowed host (DNS rebinding), and an `Origin` header names
 *   the server or a permitted origin. A request with cookies needs a named origin (CSRF).
 * - The credentials are not checked here (CLI-2b). After the browser checks, the face gives each
 *   request to the admission of its server (`admission()` of the handler): the request hook, the
 *   token check and the authenticate function, one time for each request. Before, this function
 *   compared the token itself, next to the token check of the server.
 *
 * The other guards of the face:
 *
 * - The face reads the body of a request that starts a session to a limit (4 MiB, the limit of
 *   the SDK), with `readJsonBody` of the core. Only an `initialize` request starts a session, so
 *   a stray POST makes no MCP server.
 * - The face keeps at most `maxSessions` sessions: 256 by default (CLI-51). A new session above
 *   the limit closes the session that was idle longest: no task in progress and no open response.
 *   When each session is busy, the new session gets 503 with `Retry-After`. `Infinity` turns the
 *   limit off.
 * - `assertLoopbackBind` refuses a listener on an address that is not loopback, unless the
 *   operator allows it. The owner of the listener calls it before it listens.
 */

import type { IncomingMessage } from "node:http";
import { checkBrowserRequest, isLoopbackHost, type BrowserGuardOptions } from "@procedures/client";

/** The limits of the Streamable HTTP face. `maxBodyBytes` and `maxSessions` of the HTTP options change them. */
export const MCP_HTTP_LIMITS: {
  /** The largest body of a request: 4 MiB, the limit of the SDK. */
  readonly maxBodyBytes: 4_194_304;
  /**
   * The most sessions at one time: 256 (CLI-51). Each live client of the MCP SDK keeps its GET
   * stream open, so the limit does not close it. Thus the limit is much more than the clients of
   * one host. Each live session also holds a socket, and 256 is much less than the usual limit of
   * 1024 open files of a process. `maxSessions: Infinity` turns the limit off.
   */
  readonly maxSessions: 256;
  /** The seconds in the `Retry-After` header of a 503, when each session is busy. */
  readonly retryAfterSeconds: 5;
} = {
  maxBodyBytes: 4_194_304,
  maxSessions: 256,
  retryAfterSeconds: 5,
};

/**
 * The options of `guardMcpRequest`: the browser checks. Since CLI-2b they have no token. The
 * server of the face checks the token in its admission, one time for each request.
 */
export interface McpRequestGuardOptions {
  /** The browser origins that can call the face, besides its own origin. */
  readonly allowedOrigins?: BrowserGuardOptions["allowedOrigins"];
  /** The host names that a request on a loopback address can name, besides the loopback names. */
  readonly allowedHosts?: BrowserGuardOptions["allowedHosts"];
  /** True when the server trusts cookies for the request: then only a named origin can call (CSRF). */
  readonly ambient?: boolean | undefined;
}

/** The result of the checks: the request passes, or the HTTP status, the error and the headers to send. */
export type McpGuardResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly status: 401 | 403 | 405 | 415;
      readonly code: string;
      /** The reason of a FORBIDDEN refusal of wire v1, for example `origin-not-allowed` (CLI-4). */
      readonly reason?: string | undefined;
      readonly message: string;
      readonly headers?: Readonly<Record<string, string>> | undefined;
    };

/**
 * The browser checks of a request to the MCP endpoint: one check of the host and the origin. The
 * credentials are the job of the admission of the server (CLI-2b). A `token` option throws an
 * error: before, this function compared it, and a token without its check opens the endpoint.
 */
export function guardMcpRequest(req: Pick<IncomingMessage, "method" | "headers" | "socket">, options: McpRequestGuardOptions = {}): McpGuardResult {
  if (Reflect.get(options, "token") !== undefined) {
    throw new TypeError("guardMcpRequest checks no token since CLI-2b. Give the token to the server, and admit each request with admission() of the server.");
  }
  const browser: BrowserGuardOptions = {
    ...(options.allowedOrigins !== undefined ? { allowedOrigins: options.allowedOrigins } : {}),
    ...(options.allowedHosts !== undefined ? { allowedHosts: options.allowedHosts } : {}),
  };
  const checked = checkBrowserRequest(req, browser, false, options.ambient === true);
  if (!checked.ok) return checked;
  return { ok: true };
}

/**
 * This function refuses a listener on an address that is not loopback, unless `allowRemote` is
 * true. Then other computers can reach the tools and try the token.
 */
export function assertLoopbackBind(host: string, allowRemote = false): void {
  if (isLoopbackHost(host) || allowRemote) return;
  throw new Error(`The MCP endpoint would listen on ${host}, which is not a loopback address. To serve other computers, allow it (allowRemote).`);
}
