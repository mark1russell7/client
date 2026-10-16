/**
 * The lookup of the restic program. WinGet installs restic as a portable program in its own
 * folder, and that folder is not always on the `PATH`.
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { win32 } from "node:path";

/** The settings of `findRestic()`. A test gives other values. */
export interface FindResticOptions {
  /** The environment to read (default: `process.env`) */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  /** The platform (default: `process.platform`) */
  readonly platform?: NodeJS.Platform | undefined;
  /** This function tells if a path exists (default: `existsSync`). */
  readonly exists?: ((path: string) => boolean) | undefined;
  /** This function gives the names in a folder (default: `readdir`). */
  readonly list?: ((folder: string) => Promise<string[]>) | undefined;
}

/**
 * This function finds the restic program. It gives the first of these:
 *
 * 1. `RESTIC_EXE` of the environment, when it is set.
 * 2. On Windows, the `restic*.exe` of a WinGet package `restic.restic*` in
 *    `%LOCALAPPDATA%\Microsoft\WinGet\Packages`.
 * 3. `restic`: the `PATH` gives the program.
 */
export async function findRestic(options: FindResticOptions = {}): Promise<string> {
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const list = options.list ?? ((folder: string) => readdir(folder));
  const override = env["RESTIC_EXE"];
  if (override !== undefined && override.length > 0) return override;

  const localAppData = env["LOCALAPPDATA"];
  if ((options.platform ?? process.platform) === "win32" && localAppData !== undefined && localAppData.length > 0) {
    const packages = win32.join(localAppData, "Microsoft", "WinGet", "Packages");
    if (exists(packages)) {
      try {
        for (const folder of (await list(packages)).sort()) {
          if (!folder.toLowerCase().startsWith("restic.restic")) continue;
          const names = (await list(win32.join(packages, folder))).sort();
          const program = names.find((name) => name.toLowerCase().startsWith("restic") && name.toLowerCase().endsWith(".exe"));
          if (program !== undefined) return win32.join(packages, folder, program);
        }
      } catch {
        // A folder that cannot be read gives no program: the PATH is the last choice
      }
    }
  }
  return "restic";
}
