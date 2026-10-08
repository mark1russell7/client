/**
 * pnpm.install procedure
 *
 * Install packages using pnpm.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { PnpmInstallInput, PnpmCommandOutput } from "../../types.js";
/**
 * Install packages using pnpm
 *
 * @example
 * // Install all dependencies from package.json
 * await client.call(["pnpm", "install"], {});
 *
 * @example
 * // Install specific packages as dev dependencies
 * await client.call(["pnpm", "install"], {
 *   packages: ["vitest", "@types/node"],
 *   dev: true,
 * });
 */
export declare function pnpmInstall(input: PnpmInstallInput, ctx: ProcedureContext): Promise<PnpmCommandOutput>;
//# sourceMappingURL=install.d.ts.map