/**
 * lib-refresh schematic
 *
 * Refreshes a single package with dry-run support:
 * 1. Cleanup (if force): rm node_modules/, dist/, pnpm-lock.yaml
 * 2. pnpm install
 * 3. pnpm build
 * 4. git commit/push (if not skipGit)
 */
import type { Rule } from "@angular-devkit/schematics";
export interface LibRefreshOptions {
    packagePath: string;
    packageName: string;
    force?: boolean;
    skipGit?: boolean;
    dryRun?: boolean;
}
export interface RefreshStepResult {
    step: string;
    success: boolean;
    message: string;
    skipped?: boolean;
}
/**
 * Get the results of the refresh operation
 */
export declare function getRefreshResults(): RefreshStepResult[];
/**
 * Clear results (call before starting a new refresh)
 */
export declare function clearRefreshResults(): void;
/**
 * Main schematic factory
 */
export declare function libRefresh(options: LibRefreshOptions): Rule;
//# sourceMappingURL=index.d.ts.map