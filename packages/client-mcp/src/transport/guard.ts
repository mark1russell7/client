/**
 * The checks of a request to the Streamable HTTP face (CLI-35), in one place.
 *
 * The face and the listener of a procedures host (CLI-11) call `guardMcpRequest` before a request
 * reaches the MCP SDK. The checks:
 *
 * - The checks of a web browser (`checkBrowserRequest` of the core): a request on a loopback
 *   address names a loopback host (DNS rebinding), and an `Origin` header names the server or an
 *   allowed origin. A request with cookies needs a named origin (CSRF).
 * - The bearer token. The check compares the SHA-256 digests of the two tokens in constant time,
 *   so the time tells neither the text nor the length of the token.
 *
 * The other guards of the face:
 *
 * - `readMcpBody` reads the body of a request that starts a session, to a limit (4 MiB). Only an
 *   `initialize` request starts a session, so a stray POST makes no MCP server.
 * - The face keeps at most `maxSessions` sessions (32). A new session above the limit closes the
 *   session that was idle longest, with no task in progress and no open GET stream.
 * - `assertLoopbackBind` refuses a listener on an address that is not loopback, unless the
 *   operator allows it. The owner of the listener calls it before it listens.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { bearerOf, checkBrowserRequest, isLoopbackHost, type BrowserGuardOptions } from "@procedures/client";

/** The limits of the Streamable HTTP face. `maxSessions` and `maxBodyBytes` of the HTTP options change them. */
export const MCP_HTTP_LIMITS = {
  /** The largest body of a request that starts a session: 4 MiB, the limit of the SDK. */
  maxBodyBytes: 4_194_304,
  /** The most sessions at one time. */
  maxSessions: 32,
} as const;

/** The options of `guardMcpRequest`. */
export interface McpRequestGuardOptions {
  /** The token that each request sends as `Authorization: Bearer <token>`. Without it, the face checks no token. */
  readonly token?: string | undefined;
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
      readonly message: string;
      readonly headers?: Readonly<Record<string, string>> | undefined;
    };

const digest = (text: string): Buffer => createHash("sha256").update(text, "utf8").digest();

/**
 * True when the presented token is the expected one. The function compares the SHA-256 digests in
 * constant time, so the time depends on neither the text nor the length of either token.
 */
export function sameToken(presented: string | undefined, expected: string): boolean {
  if (presented === undefined) return false;
  return timingSafeEqual(digest(presented), digest(expected));
}

/** The checks of a request to the MCP endpoint: the browser checks, then the token. */
export function guardMcpRequest(req: Pick<IncomingMessage, "method" | "headers" | "socket">, options: McpRequestGuardOptions = {}): McpGuardResult {
  const browser: BrowserGuardOptions = {
    ...(options.allowedOrigins !== undefined ? { allowedOrigins: options.allowedOrigins } : {}),
    ...(options.allowedHosts !== undefined ? { allowedHosts: options.allowedHosts } : {}),
  };
  const checked = checkBrowserRequest(req, browser, false, options.ambient === true);
  if (!checked.ok) return checked;
  if (options.token !== undefined && !sameToken(bearerOf(req.headers.authorization), options.token)) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Unauthorized: this server requires its token",
      headers: { "www-authenticate": 'Bearer realm="mcp"' },
    };
  }
  return { ok: true };
}

/** The error of `readMcpBody`: the body is too large (413) or is not JSON (400). */
export class McpBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413
  ) {
    super(message);
    this.name = "McpBodyError";
  }
}

/** This function reads the JSON body of a request to a limit of bytes. */
export async function readMcpBody(req: AsyncIterable<unknown>, limit: number = MCP_HTTP_LIMITS.maxBodyBytes): Promise<unknown> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    size += part.length;
    if (size > limit) throw new McpBodyError(`The body of the request is larger than ${String(limit)} bytes`, 413);
    parts.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
  } catch {
    throw new McpBodyError("The body of the request is not JSON", 400);
  }
}

/**
 * This function refuses a listener on an address that is not loopback, unless `allowRemote` is
 * true. Then other computers can reach the tools and try the token.
 */
export function assertLoopbackBind(host: string, allowRemote = false): void {
  if (isLoopbackHost(host) || allowRemote) return;
  throw new Error(`The MCP endpoint would listen on ${host}, which is not a loopback address. To serve other computers, allow it (allowRemote).`);
}
