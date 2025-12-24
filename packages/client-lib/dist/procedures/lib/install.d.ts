/**
 * lib.install procedure
 *
 * Installs the entire ecosystem:
 * 1. Reads ecosystem manifest from @mark1russell7/ecosystem
 * 2. Clones missing packages
 * 3. Installs and builds all packages in DAG order
 *
 * @deprecated This imperative implementation is deprecated.
 * Use the aggregation version via `registerAggregationProcedures()` instead:
 * - Import: `import { registerAggregationProcedures } from "@mark1russell7/client-lib"`
 * - Register: `await registerAggregationProcedures(client)`
 * - Call: `await client.call(["agg", "lib", "install"], input)`
 *
 * The aggregation version (libInstallAggregation) provides:
 * - Declarative JSON-serializable definition
 * - Runtime introspection
 * - Consistent error handling via the aggregation executor
 *
 * This imperative version will be removed in v2.0.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibInstallInput, LibInstallOutput } from "../../types.js";
/**
 * Install the entire ecosystem
 *
 * @deprecated Use libInstallAggregation via registerAggregationProcedures() instead.
 * This imperative version will be removed in v2.0.
 */
export declare function libInstall(input: LibInstallInput, ctx: ProcedureContext): Promise<LibInstallOutput>;
//# sourceMappingURL=install.d.ts.map