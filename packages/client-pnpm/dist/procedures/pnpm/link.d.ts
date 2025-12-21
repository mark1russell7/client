/**
 * pnpm.link procedure
 *
 * Link packages using pnpm.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { PnpmLinkInput, PnpmCommandOutput } from "../../types.js";
/**
 * Link packages using pnpm
 *
 * @example
 * // Link current directory globally
 * await client.call(["pnpm", "link"], {
 *   global: true,
 * });
 *
 * @example
 * // Link a specific path
 * await client.call(["pnpm", "link"], {
 *   path: "../other-package",
 * });
 */
export declare function pnpmLink(input: PnpmLinkInput, ctx: ProcedureContext): Promise<PnpmCommandOutput>;
//# sourceMappingURL=link.d.ts.map