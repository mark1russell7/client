/**
 * The expose rule of a server, from a list of patterns.
 *
 * A pattern is an exact procedure key (`git.status`), a prefix with `.*` (`git.*`: every
 * procedure under `git`, at any depth), or `*` (every procedure). A server without a list
 * serves every procedure of its registry.
 *
 * The rule is `exposePatterns()` of the core host policy (roadmap 2.3); this name stays for the
 * callers of `client-server`.
 */

import { exposePatterns, type ProcedurePath } from "@mark1russell7/client";

/** This function gives the rule of `ProcedureServer` for a list of patterns. */
export function exposeRule(patterns: readonly string[]): (path: ProcedurePath) => boolean {
  return exposePatterns(patterns);
}
