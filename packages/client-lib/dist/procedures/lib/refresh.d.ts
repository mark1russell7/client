/**
 * lib.refresh procedure
 *
 * Refreshes a library by:
 * 1. rm -rf node_modules/, dist/, pnpm-lock.yaml
 * 2. pnpm install
 * 3. pnpm run build
 * 4. git add -A && git commit && git push
 *
 * With --recursive, processes dependencies in post-order (bottom-up).
 *
 * @deprecated This imperative implementation is deprecated.
 * Use the aggregation version via `registerAggregationProcedures()` instead:
 * - Import: `import { registerAggregationProcedures } from "@mark1russell7/client-lib"`
 * - Register: `await registerAggregationProcedures(client)`
 * - Call: `await client.call(["agg", "lib", "refresh"], input)`
 *
 * The aggregation version (libRefreshAggregation) provides:
 * - Declarative JSON-serializable definition
 * - Runtime introspection
 * - Consistent error handling via the aggregation executor
 *
 * This imperative version will be removed in v2.0.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibRefreshInput, LibRefreshOutput } from "../../types.js";
/**
 * Refresh a package and optionally its dependencies recursively
 *
 * @deprecated Use libRefreshAggregation via registerAggregationProcedures() instead.
 * This imperative version will be removed in v2.0.
 */
export declare function libRefresh(input: LibRefreshInput, ctx: ProcedureContext): Promise<LibRefreshOutput>;
//# sourceMappingURL=refresh.d.ts.map