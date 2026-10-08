/**
 * pnpm.store.path procedure
 *
 * Get the pnpm store path for snapshot/restore operations.
 * Cross-platform support for Windows, macOS, and Linux.
 */
import type { PnpmStorePathInput, PnpmStorePathOutput } from "../../types.js";
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
export declare function pnpmStorePath(input: PnpmStorePathInput): Promise<PnpmStorePathOutput>;
//# sourceMappingURL=store.d.ts.map