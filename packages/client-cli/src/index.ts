/**
 * @mark1russell7/client-cli
 *
 * Angular Schematics for the mark1russell7 ecosystem.
 *
 * NOTE: All procedures and utilities have been moved to their canonical packages:
 * - lib.*, ecosystem.*, dag.* procedures → @mark1russell7/client-lib
 * - procedure.* procedures → @mark1russell7/client-procedure
 * - DAG algorithms → @mark1russell7/client-dag
 * - Git utilities → @mark1russell7/client-git
 * - FS utilities → @mark1russell7/client-fs
 *
 * This package now only provides Angular Schematics for:
 * - lib-new: Create new packages in the ecosystem
 * - lib-refresh: Refresh package dependencies
 *
 * @example
 * ```bash
 * # Use via the mark CLI
 * mark lib new my-package
 * mark lib refresh --all
 * ```
 */

// Re-export from canonical packages for backwards compatibility
export type {
  LibScanInput,
  LibScanOutput,
  PackageInfo,
  LibRefreshInput,
  LibRefreshOutput,
  RefreshResult,
  LibRenameInput,
  LibRenameOutput,
  RenameChange,
  LibNewInput,
  LibNewOutput,
  LibAuditInput,
  LibAuditOutput,
  PackageAuditResult,
  DAGNode,
  DependencyDAG,
  DAGExecutionOptions,
  NodeResult,
  DAGResult,
  GitRef,
  GitStatus,
} from "@mark1russell7/client-lib";

export {
  LibScanInputSchema,
  LibRefreshInputSchema,
  LibRenameInputSchema,
  LibNewInputSchema,
  LibAuditInputSchema,
} from "@mark1russell7/client-lib";

// Note: registerCliProcedures is a no-op, kept for backwards compatibility
export { registerCliProcedures } from "./register.js";
