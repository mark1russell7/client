/**
 * glob procedure
 *
 * Find files matching glob pattern
 */

import { glob as nodeGlob } from "node:fs/promises";
import type { GlobInput, GlobOutput } from "../../types.js";

/**
 * Find files matching glob pattern
 */
export async function glob(input: GlobInput): Promise<GlobOutput> {
  const { pattern, cwd, absolute, dot } = input;
  const options: { cwd?: string; absolute?: boolean; dot?: boolean } = {};
  if (cwd) options.cwd = cwd;
  if (absolute) options.absolute = absolute;
  if (dot) options.dot = dot;

  const matches: string[] = [];
  for await (const match of nodeGlob(pattern, options)) {
    matches.push(match);
  }

  return { pattern, matches };
}
