/**
 * Procedure Definition Procedure
 *
 * Meta-procedure that creates procedures at runtime from JSON aggregations.
 * Enables fully declarative procedure definition without native TypeScript code.
 *
 * @example
 * ```typescript
 * // Define a procedure that chains multiple steps
 * await client.call(["procedure", "define"], {
 *   path: ["my", "workflow"],
 *   aggregation: {
 *     $proc: ["client", "chain"],
 *     input: {
 *       steps: [
 *         { $proc: ["fs", "mkdir"], input: { path: { $ref: "input.dir" } } },
 *         { $proc: ["git", "init"], input: { cwd: { $ref: "input.dir" } } },
 *       ],
 *     },
 *   },
 * });
 *
 * // Now use the defined procedure
 * await client.call(["my", "workflow"], { dir: "/path/to/project" });
 * ```
 */
import type { Procedure, ProcedurePath, ProcedureMetadata, AnyProcedure } from "./types.js";
/**
 * JSON-serializable aggregation definition.
 * Represents a procedure call tree that will be executed when the procedure runs.
 */
export interface AggregationDefinition {
    /** Procedure to call */
    $proc: ProcedurePath;
    /** Input for the procedure (may contain $ref and nested $proc) */
    input: unknown;
    /** Optional name for output referencing */
    $name?: string;
}
/**
 * Input for defining a new procedure.
 */
export interface DefineProcedureInput {
    /** Path for the new procedure */
    path: ProcedurePath;
    /**
     * Aggregation definition - the procedure body as a JSON tree.
     * This gets executed when the procedure is called.
     */
    aggregation: AggregationDefinition;
    /**
     * Optional metadata for the procedure.
     */
    metadata?: ProcedureMetadata;
    /**
     * Whether to replace an existing procedure with this path.
     * Default: false (throws if procedure exists)
     */
    replace?: boolean;
}
/**
 * Output from defining a procedure.
 */
export interface DefineProcedureOutput {
    /** The path of the defined procedure */
    path: ProcedurePath;
    /** Whether an existing procedure was replaced */
    replaced: boolean;
}
/**
 * Get a runtime-defined procedure by path.
 */
export declare function getRuntimeProcedure(path: ProcedurePath): AnyProcedure | undefined;
/**
 * Check if a runtime procedure exists.
 */
export declare function hasRuntimeProcedure(path: ProcedurePath): boolean;
/**
 * Get all runtime-defined procedures.
 */
export declare function getAllRuntimeProcedures(): AnyProcedure[];
/**
 * Clear all runtime-defined procedures.
 * Useful for testing.
 */
export declare function clearRuntimeProcedures(): void;
/**
 * Metadata for the procedure.define procedure.
 */
interface DefineMetadata extends ProcedureMetadata {
    description: string;
    tags: string[];
    /** This is a meta-procedure that creates other procedures */
    metaProcedure: true;
}
/**
 * The procedure.define procedure.
 *
 * This is a meta-procedure that creates other procedures at runtime
 * from JSON aggregation definitions.
 */
export declare const defineProcedureProcedure: Procedure<DefineProcedureInput, DefineProcedureOutput, DefineMetadata>;
/**
 * Get a runtime-defined procedure by path.
 */
export declare const getProcedureProcedure: Procedure<{
    path: ProcedurePath;
}, AnyProcedure | null, ProcedureMetadata>;
/**
 * List all runtime-defined procedures.
 */
export declare const listProceduresProcedure: Procedure<Record<string, never>, {
    procedures: Array<{
        path: ProcedurePath;
        metadata: ProcedureMetadata;
    }>;
}, ProcedureMetadata>;
/**
 * Delete a runtime-defined procedure.
 */
export declare const deleteProcedureProcedure: Procedure<{
    path: ProcedurePath;
}, {
    deleted: boolean;
}, ProcedureMetadata>;
/**
 * All meta-procedures for procedure management.
 */
export declare const metaProcedures: AnyProcedure[];
export {};
//# sourceMappingURL=define-procedure.d.ts.map