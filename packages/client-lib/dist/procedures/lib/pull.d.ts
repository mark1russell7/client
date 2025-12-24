/**
 * lib.pull procedure
 *
 * Pull from remote for all packages in dependency order.
 * Like lib.refresh --all but only does git pull (no install/build/push).
 *
 * @deprecated This imperative implementation is deprecated.
 * Use the aggregation version via `registerAggregationProcedures()` instead:
 * - Import: `import { registerAggregationProcedures } from "@mark1russell7/client-lib"`
 * - Register: `await registerAggregationProcedures(client)`
 * - Call: `await client.call(["agg", "lib", "pull"], input)`
 *
 * The aggregation version (libPullAggregation) provides:
 * - Declarative JSON-serializable definition
 * - Runtime introspection
 * - Consistent error handling via the aggregation executor
 *
 * This imperative version will be removed in v2.0.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibPullInput, LibPullOutput } from "../../types.js";
/**
 * Pull from remote for all packages in dependency order
 *
 * @deprecated Use libPullAggregation via registerAggregationProcedures() instead.
 * This imperative version will be removed in v2.0.
 */
export declare function libPull(input: LibPullInput, ctx: ProcedureContext): Promise<LibPullOutput>;
//# sourceMappingURL=pull.d.ts.map