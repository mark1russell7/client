/**
 * Aggregation Registration via procedure.define
 *
 * This module registers aggregation-based versions of lib procedures
 * using the procedure.define meta-procedure system.
 *
 * Usage:
 * ```typescript
 * import { registerAggregationProcedures } from "@mark1russell7/client-lib/register-aggregations";
 *
 * // Register with a client that has procedure.define available
 * await registerAggregationProcedures(client);
 * ```
 *
 * The aggregation versions are registered alongside the imperative versions
 * with different paths (lib.new.agg, lib.refresh.agg, etc.) for testing.
 * Once validated, they can replace the imperative versions.
 */
import type { AggregationDefinition } from "@mark1russell7/client";
/**
 * Aggregation registration entry
 */
interface AggregationRegistration {
    /** Procedure path */
    path: string[];
    /** Aggregation definition */
    aggregation: AggregationDefinition;
    /** Optional metadata */
    metadata?: {
        description?: string;
        tags?: string[];
        deprecated?: boolean;
    };
}
/**
 * All aggregation definitions to register
 */
export declare const aggregationRegistry: AggregationRegistration[];
/**
 * Client interface for procedure.define
 */
interface ProcedureDefineClient {
    call: <I, O>(path: readonly string[], input: I) => Promise<O>;
}
/**
 * Register all aggregation-based procedures via procedure.define
 *
 * @param client - Client with procedure.define available
 * @param options - Registration options
 * @returns Registration results
 */
export declare function registerAggregationProcedures(client: ProcedureDefineClient, options?: {
    /** Replace existing procedures with same path */
    replace?: boolean;
    /** Only register specific paths (filter) */
    filter?: (path: string[]) => boolean;
    /** Log registration progress */
    verbose?: boolean;
}): Promise<{
    registered: string[];
    skipped: string[];
    errors: Array<{
        path: string;
        error: string;
    }>;
}>;
/**
 * Get all aggregation definitions (for inspection/testing)
 */
export declare function getAllAggregations(): AggregationRegistration[];
/**
 * Get aggregation by path
 */
export declare function getAggregation(path: string[]): AggregationRegistration | undefined;
/**
 * List all registered aggregation paths
 */
export declare function listAggregationPaths(): string[];
export {};
//# sourceMappingURL=register-aggregations.d.ts.map