/**
 * The expose rule of a server, from a list of patterns.
 *
 * A pattern is an exact procedure key (`git.status`), a prefix with `.*` (`git.*`: every
 * procedure under `git`, at any depth), or `*` (every procedure). A server without a list
 * serves every procedure of its registry.
 */

import type { ProcedurePath } from "@mark1russell7/client";

/** This function gives the rule of `ProcedureServer` for a list of patterns. */
export function exposeRule(patterns: readonly string[]): (path: ProcedurePath) => boolean {
  const exact = new Set<string>();
  const prefixes: string[] = [];
  let all = false;
  for (const pattern of patterns) {
    if (pattern === "*") all = true;
    else if (pattern.endsWith(".*")) prefixes.push(pattern.slice(0, -1));
    else exact.add(pattern);
  }
  return (path) => {
    if (all) return true;
    const key = path.join(".");
    return exact.has(key) || prefixes.some((prefix) => key.startsWith(prefix));
  };
}
