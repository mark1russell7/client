/**
 * The programs of the snapshot procedures: git through the `git.*` procedures, and pnpm.
 *
 * - Git goes through the `git.*` procedures of the host (`ctx.client`), not through a process of
 *   this package. Under a root of the files, the rules of the root then apply to each git command:
 *   the working folder in the root, no hooks, no configuration that starts a program (tracker
 *   item O46).
 * - The version of pnpm comes from the `package.json` of the pnpm package. No program starts, so the
 *   declared effects of `snapshot.create` do not need `process`. Under a root, the version is
 *   "unknown".
 */

import type { ProcedureContext, ProcedurePath } from "@procedures/client";
import { isOutsideRoot } from "@procedures/fs/root";
import { installedPnpmVersion } from "@procedures/pnpm";

/**
 * This function starts a `git.*` procedure of the host and gives its output. It gives `undefined`
 * when the procedure fails, for example in a folder that is not a repository. A refusal of the
 * root (`FORBIDDEN` with the reason `outside-root`) is not a failure of git: it stays the error.
 */
export async function gitCall<T>(ctx: ProcedureContext, path: ProcedurePath, input: Record<string, unknown>): Promise<T | undefined> {
  try {
    return await ctx.client.call<Record<string, unknown>, T>(path, input);
  } catch (error) {
    if (isOutsideRoot(error)) throw error;
    return undefined;
  }
}

/**
 * This function gives the version of pnpm, or "unknown" when no pnpm package names it. It reads the
 * version with `installedPnpmVersion()` of `@procedures/pnpm`, and it starts no program. Under a
 * root of the files (`fsRoot`), it reads no file and gives "unknown".
 */
export function pnpmVersion(fsRoot?: string): string {
  if (fsRoot !== undefined) return "unknown";
  return installedPnpmVersion() ?? "unknown";
}
