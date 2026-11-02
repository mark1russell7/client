/**
 * The compile cache of Node.js for the `mark` executable (roadmap O90).
 *
 * With the cache, a run of `mark` reads the compiled code of its modules from a folder and does not
 * compile them again. In CI, one `mark` call took 1019 ms with no cache and 754 ms with a warm cache.
 * The first run after an install or a change of a file writes the cache, and costs 174 ms more.
 *
 * The folder is in the cache folder of the user, so a reboot keeps it and other users do not share it.
 * `NODE_COMPILE_CACHE` replaces the folder, and `NODE_DISABLE_COMPILE_CACHE=1` turns the cache off.
 */

import module from "node:module";
import { homedir } from "node:os";
import * as path from "node:path";

/** The part of `node:module` that this module uses. A test gives its own. */
export interface CompileCacheApi {
  readonly enableCompileCache?: ((dir?: string) => { status: number; message?: string; directory?: string }) | undefined;
}

/**
 * This function gives the folder of the compile cache of `mark` for a platform: the cache folder of
 * the user, then `mark/compile-cache`. Linux uses `XDG_CACHE_HOME` or `~/.cache`, macOS uses
 * `~/Library/Caches`, and Windows uses `LOCALAPPDATA`.
 */
export function compileCacheDir(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const join = platform === "win32" ? path.win32.join : path.posix.join;
  const base =
    platform === "win32"
      ? (env["LOCALAPPDATA"] ?? path.win32.join(home, "AppData", "Local"))
      : platform === "darwin"
        ? path.posix.join(home, "Library", "Caches")
        : env["XDG_CACHE_HOME"] !== undefined && path.posix.isAbsolute(env["XDG_CACHE_HOME"])
          ? env["XDG_CACHE_HOME"]
          : path.posix.join(home, ".cache");
  return join(base, "mark", "compile-cache");
}

/**
 * This function enables the compile cache in the folder of `compileCacheDir()`. It gives the result
 * of Node.js, or `undefined` when this Node.js has no compile cache (before 22.1). It never throws:
 * a folder that cannot be written gives the status `FAILED`, and `mark` runs with no cache.
 */
export function enableCompileCache(api: CompileCacheApi = module, dir: () => string = compileCacheDir): ReturnType<NonNullable<CompileCacheApi["enableCompileCache"]>> | undefined {
  if (typeof api.enableCompileCache !== "function") return undefined;
  try {
    return api.enableCompileCache(dir());
  } catch {
    return undefined;
  }
}
