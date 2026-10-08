/**
 * pnpm.store.path procedure
 *
 * Get the pnpm store path for snapshot/restore operations.
 * Cross-platform support for Windows, macOS, and Linux.
 */
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
/**
 * Get pnpm store path
 *
 * Uses `pnpm store path` command to get the actual store location.
 * Falls back to platform-specific defaults if command fails.
 *
 * Store locations by platform:
 * - Windows: %LocalAppData%\pnpm\store or %AppData%\pnpm\store
 * - macOS/Linux: ~/.local/share/pnpm/store or ~/.pnpm-store
 *
 * @example
 * const result = await client.call(["pnpm", "store", "path"], {});
 * console.log(result.path); // "C:\Users\user\AppData\Local\pnpm\store\v3"
 */
export async function pnpmStorePath(input) {
    const platform = process.platform;
    let storePath = "";
    try {
        // Try to get store path from pnpm directly
        const opts = { encoding: "utf8" };
        if (input.cwd) {
            opts.cwd = input.cwd;
        }
        storePath = execSync("pnpm store path", opts).trim();
    }
    catch {
        // Fallback to platform-specific defaults
        storePath = getDefaultStorePath(platform);
    }
    return {
        path: storePath,
        exists: existsSync(storePath),
        platform,
    };
}
/**
 * Get default pnpm store path based on platform
 */
function getDefaultStorePath(platform) {
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
//# sourceMappingURL=store.js.map