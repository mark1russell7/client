/**
 * @procedures/pnpm
 *
 * Wraps pnpm commands as procedures using client-shell.
 *
 * @example
 * ```typescript
 * import { Client } from "@procedures/client";
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
  PnpmJsonOutput,
  PnpmExecInput,
  PnpmListInput,
  PnpmWhyInput,
  PnpmOutdatedInput,
  PnpmUpdateInput,
  PnpmPackInput,
} from "./types.js";

export {
  PnpmInstallInputSchema,
  PnpmAddInputSchema,
  PnpmRemoveInputSchema,
  PnpmLinkInputSchema,
  PnpmRunInputSchema,
  PnpmExecInputSchema,
  PnpmListInputSchema,
  PnpmWhyInputSchema,
  PnpmOutdatedInputSchema,
  PnpmUpdateInputSchema,
  PnpmPackInputSchema,
} from "./types.js";

// Procedures
export {
  pnpmInstall,
  pnpmAdd,
  pnpmRemove,
  pnpmLink,
  pnpmRun,
  pnpmExec,
  pnpmList,
  pnpmWhy,
  pnpmOutdated,
  pnpmUpdate,
  pnpmPack,
} from "./procedures/pnpm/index.js";

// How the procedures find pnpm (no shell): other packages that run pnpm use it too
export { resolvePnpm } from "./procedures/pnpm/shared.js";

// Registration
export { registerPnpmProcedures } from "./module.js";
