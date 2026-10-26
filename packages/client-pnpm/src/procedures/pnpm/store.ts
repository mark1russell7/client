/**
 * pnpm.store.path procedure
 *
 * Get the pnpm store path for snapshot/restore operations.
 * Cross-platform support for Windows, macOS, and Linux.
 */

import { existsSync } from "node:fs";
import type { ProcedureContext } from "@procedures/client";
import { runPnpm } from "./shared.js";
import type { PnpmStorePathInput, PnpmStorePathOutput } from "../../types.js";

/**
 * Get pnpm store path
 *
 * Runs `pnpm store path` through `shell.run` (argv, no shell) to get the actual store location.
 * Falls back to platform-specific defaults if the command fails.
 *
 * Store locations by platform:
 * - Windows: %LocalAppData%\pnpm\store or %AppData%\pnpm\store
 * - macOS/Linux: ~/.local/share/pnpm/store or ~/.pnpm-store
 *
 * @example
 * const result = await client.call(["pnpm", "store", "path"], {});
 * console.log(result.path); // "C:\Users\user\AppData\Local\pnpm\store\v3"
 */
export async function pnpmStorePath(input: PnpmStorePathInput, ctx: ProcedureContext): Promise<PnpmStorePathOutput> {
  const platform = process.platform;
  // runPnpm does not throw: pnpm not found or a failed command gives a result that is not a success
  const result = await runPnpm(["store", "path"], { cwd: input.cwd }, ctx);
  const printed = result.success ? result.stdout.trim() : "";
  const storePath = printed || getDefaultStorePath(platform);

  return {
    path: storePath,
    exists: existsSync(storePath),
    platform,
  };
}

/**
 * Get default pnpm store path based on platform
 */
function getDefaultStorePath(platform: string): string {
  if (platform === "win32") {
    // Windows: Check LocalAppData first, then AppData
    const localAppData = process.env["LOCALAPPDATA"];
    const appData = process.env["APPDATA"];

    if (localAppData) {
      const localPath = `${localAppData}\\pnpm\\store\\v3`;
      if (existsSync(localPath)) {
        return localPath;
      }
    }

    if (appData) {
      const appDataPath = `${appData}\\pnpm\\store\\v3`;
      if (existsSync(appDataPath)) {
        return appDataPath;
      }
    }

    // Return default LocalAppData path even if it doesn't exist
    return localAppData
      ? `${localAppData}\\pnpm\\store\\v3`
      : `${process.env["USERPROFILE"]}\\AppData\\Local\\pnpm\\store\\v3`;
  }

  // macOS/Linux
  const home = process.env["HOME"] || "";

  // Check XDG data home first
  const xdgDataHome = process.env["XDG_DATA_HOME"] || `${home}/.local/share`;
  const xdgPath = `${xdgDataHome}/pnpm/store/v3`;
  if (existsSync(xdgPath)) {
    return xdgPath;
  }

  // Check legacy ~/.pnpm-store
  const legacyPath = `${home}/.pnpm-store/v3`;
  if (existsSync(legacyPath)) {
    return legacyPath;
  }

  // Return XDG path as default
  return xdgPath;
}
