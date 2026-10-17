/**
 * Request checks of a peer (deep dive TRN-1, CLI-1, CLI-2).
 *
 * A peer serves the whole registry, `shell.*` included. So:
 * - a peer bound to loopback answers only requests addressed to a loopback name (a DNS
 *   rebinding attack sends another name);
 * - a browser request is accepted only from a loopback origin or an origin in the allowlist
 *   (before, CORS was on by default with `Access-Control-Allow-Origin: *`, so any web page could
 *   call the server);
 * - when the peer has a token, every request must carry it: `Authorization: Bearer <token>` over
 *   HTTP, `?token=<token>` for a WebSocket connection (a browser WebSocket cannot set headers).
 */

import { createHash, timingSafeEqual } from "node:crypto";

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** True for a bind address that only this computer can reach. */
export function isLoopback(host: string): boolean {
  return LOOPBACK_NAMES.has(host);
}

/** The name of a Host header without its port: "localhost:3000" gives "localhost", "[::1]:80" gives "[::1]". */
export function hostName(header: string | undefined): string {
  if (!header) return "";
  if (header.startsWith("[")) return header.slice(0, header.indexOf("]") + 1).toLowerCase();
  return (header.split(":")[0] ?? "").toLowerCase();
}

/** A peer bound to loopback accepts only a loopback Host header. */
export function hostAllowed(bindHost: string, header: string | undefined): boolean {
  return !isLoopback(bindHost) || LOOPBACK_NAMES.has(hostName(header));
}

/** A request without Origin (not a browser) passes; a browser origin must be loopback or in the allowlist. */
export function originAllowed(origin: string | undefined, allowlist: readonly string[] = []): boolean {
  if (origin === undefined) return true;
  if (allowlist.includes(origin)) return true;
  try {
    return LOOPBACK_NAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** True when no token is required, or when the presented token is the expected one (a constant-time comparison). */
export function tokenMatches(expected: string | undefined, presented: string | undefined | null): boolean {
  if (expected === undefined) return true;
  if (!presented) return false;
  // Both sides become SHA-256 digests of 32 bytes, so the comparison takes the same time for
  // each presented token. Before, a token of another length returned at once, and the time
  // told the length of the token.
  const digest = (token: string): Buffer => createHash("sha256").update(token, "utf8").digest();
  return timingSafeEqual(digest(expected), digest(presented));
}

/** The token of an `Authorization: Bearer <token>` header. */
export function bearerToken(header: string | undefined): string | undefined {
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}
