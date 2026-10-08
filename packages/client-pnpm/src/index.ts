/**
 * @mark1russell7/client-pnpm
 *
 * Wraps pnpm commands as procedures using client-shell.
 *
 * @example
 * ```typescript
 * import { Client } from "@mark1russell7/client";
 *
 * // Install dependencies
 * await client.call(["pnpm", "install"], {});
 *
 * // Add a package
 * await client.call(["pnpm", "add"], {
 *   packages: ["lodash"],
 *   dev: true,
 * });
 *
 * // Link a package
 * await client.call(["pnpm", "link"], {
 *   path: "../other-package",
 * });
 * ```
 */

// Types
export type {
  PnpmInstallInput,
  PnpmAddInput,
  PnpmRemoveInput,
  PnpmLinkInput,
  PnpmRunInput,
  PnpmCommandOutput,
} from "./types.js";

export {
  PnpmInstallInputSchema,
  PnpmAddInputSchema,
  PnpmRemoveInputSchema,
  PnpmLinkInputSchema,
  PnpmRunInputSchema,
} from "./types.js";

// Procedures
export {
  pnpmInstall,
  pnpmAdd,
  pnpmRemove,
  pnpmLink,
  pnpmRun,
} from "./procedures/pnpm/index.js";

// Registration
export { registerPnpmProcedures } from "./register.js";
