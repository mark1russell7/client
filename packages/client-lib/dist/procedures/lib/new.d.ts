/**
 * lib.new procedure
 *
 * Creates a new package with standard ecosystem structure.
 * Reads projectTemplate from ecosystem.manifest.json (single source of truth).
 * Uses fs.* and git.* procedures via ctx.client.call() for all operations.
 *
 * @deprecated This imperative implementation is deprecated.
 * Use the aggregation version via `registerAggregationProcedures()` instead:
 * - Import: `import { registerAggregationProcedures } from "@mark1russell7/client-lib"`
 * - Register: `await registerAggregationProcedures(client)`
 * - Call: `await client.call(["agg", "lib", "new"], input)`
 *
 * The aggregation version (libNewAggregation) provides:
 * - Declarative JSON-serializable definition
 * - Runtime introspection
 * - Consistent error handling via the aggregation executor
 *
 * This imperative version will be removed in v2.0.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibNewInput, LibNewOutput } from "../../types.js";
/**
 * Create a new package with standard ecosystem structure
 *
 * @deprecated Use libNewAggregation via registerAggregationProcedures() instead.
 * This imperative version will be removed in v2.0.
 */
export declare function libNew(input: LibNewInput, ctx: ProcedureContext): Promise<LibNewOutput>;
//# sourceMappingURL=new.d.ts.map