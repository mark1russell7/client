/**
 * Core Language Procedures
 *
 * Foundational procedures for composing and controlling procedure execution.
 * These procedures enable declarative pipelines and control flow.
 *
 * Core procedures:
 * - `chain` - Execute procedures sequentially, passing results through
 * - `parallel` - Execute procedures concurrently
 * - `conditional` - Conditional execution (if/then/else)
 * - `and` - Short-circuit AND (returns first falsy or last result)
 * - `or` - Short-circuit OR (returns first truthy result)
 * - `map` - Map over array with a procedure
 * - `reduce` - Reduce array with a procedure
 * - `identity` - Return input unchanged
 * - `constant` - Return a constant value
 *
 * @example
 * ```typescript
 * import { proc } from "@mark1russell7/client";
 *
 * // Sequential execution
 * const pipeline = proc(["client", "chain"]).input({
 *   steps: [
 *     proc(["git", "add"]).input({ all: true }).ref,
 *     proc(["git", "commit"]).input({ message: "auto" }).ref,
 *     proc(["git", "push"]).input({}).ref,
 *   ],
 * });
 *
 * // Parallel execution
 * const parallel = proc(["client", "parallel"]).input({
 *   tasks: [
 *     proc(["lib", "build"]).input({ path: "pkg1" }).ref,
 *     proc(["lib", "build"]).input({ path: "pkg2" }).ref,
 *   ],
 * });
 *
 * // Conditional
 * const conditional = proc(["client", "conditional"]).input({
 *   condition: proc(["git", "hasChanges"]).input({}).ref,
 *   then: proc(["git", "commit"]).input({ message: "auto" }).ref,
 *   else: proc(["client", "identity"]).input({ message: "no changes" }).ref,
 * });
 * ```
 */
import type { AnyProcedure, Procedure } from "../types.js";
interface ChainInput {
    /** Procedures to execute in sequence */
    steps: unknown[];
    /** If true, pass each step's output as input to the next step */
    passThrough?: boolean;
    /** Initial input for the first step (when passThrough is true) */
    initialInput?: unknown;
}
interface ChainOutput {
    /** Results from each step */
    results: unknown[];
    /** Final result (last step's output) */
    final: unknown;
}
type ChainProcedure = Procedure<ChainInput, ChainOutput, {
    description: string;
    tags: string[];
}>;
declare const chainProcedure: ChainProcedure;
interface ParallelInput {
    /** Procedures to execute in parallel */
    tasks: unknown[];
    /** Maximum concurrency (default: unlimited) */
    concurrency?: number;
    /** Whether to fail fast on first error (default: false) */
    failFast?: boolean;
}
interface ParallelOutput {
    /** Results from each task (in order) */
    results: unknown[];
    /** Whether all tasks succeeded */
    allSucceeded: boolean;
    /** Errors from failed tasks */
    errors: Array<{
        index: number;
        error: string;
    }>;
}
type ParallelProcedure = Procedure<ParallelInput, ParallelOutput, {
    description: string;
    tags: string[];
}>;
declare const parallelProcedure: ParallelProcedure;
interface ConditionalInput {
    /** Condition value (truthy/falsy) */
    condition: unknown;
    /** Value/result to use if condition is truthy */
    then: unknown;
    /** Value/result to use if condition is falsy */
    else?: unknown;
}
type ConditionalProcedure = Procedure<ConditionalInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const conditionalProcedure: ConditionalProcedure;
interface AndInput {
    /** Values to AND together (short-circuit) */
    values: unknown[];
}
type AndProcedure = Procedure<AndInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const andProcedure: AndProcedure;
interface OrInput {
    /** Values to OR together (short-circuit) */
    values: unknown[];
}
type OrProcedure = Procedure<OrInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const orProcedure: OrProcedure;
interface NotInput {
    /** Value to negate */
    value: unknown;
}
type NotProcedure = Procedure<NotInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const notProcedure: NotProcedure;
interface MapInput {
    /** Array to map over */
    items: unknown[];
    /** Results from mapping (items should be procedure refs that get hydrated) */
    results?: unknown[];
}
interface MapOutput {
    /** Mapped results */
    results: unknown[];
}
type MapProcedure = Procedure<MapInput, MapOutput, {
    description: string;
    tags: string[];
}>;
declare const mapProcedure: MapProcedure;
interface ReduceInput {
    /** Array to reduce */
    items: unknown[];
    /** Initial accumulator value */
    initial: unknown;
    /** Reducer results (computed externally via procedure refs) */
    accumulated?: unknown;
}
type ReduceProcedure = Procedure<ReduceInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const reduceProcedure: ReduceProcedure;
interface IdentityInput {
    /** Value to return unchanged */
    value: unknown;
}
type IdentityProcedure = Procedure<IdentityInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const identityProcedure: IdentityProcedure;
interface ConstantInput {
    /** Constant value to return */
    value: unknown;
}
type ConstantProcedure = Procedure<ConstantInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const constantProcedure: ConstantProcedure;
interface ThrowInput {
    /** Error message */
    message: string;
    /** Error code */
    code?: string;
}
type ThrowProcedure = Procedure<ThrowInput, never, {
    description: string;
    tags: string[];
}>;
declare const throwProcedure: ThrowProcedure;
interface TryCatchInput {
    /** Value to try (should be a procedure ref) */
    try: unknown;
    /** Value to use on error (should be a procedure ref or value) */
    catch: unknown;
}
interface TryCatchOutput {
    /** Whether the try succeeded */
    success: boolean;
    /** Result value */
    value: unknown;
    /** Error if failed */
    error?: string;
}
type TryCatchProcedure = Procedure<TryCatchInput, TryCatchOutput, {
    description: string;
    tags: string[];
}>;
declare const tryCatchProcedure: TryCatchProcedure;
/**
 * All core language procedures namespaced under "client".
 */
export declare const coreProcedures: AnyProcedure[];
/**
 * Core procedures module for registration.
 */
export declare const coreModule: {
    name: string;
    procedures: AnyProcedure[];
};
export { chainProcedure, parallelProcedure, conditionalProcedure, andProcedure, orProcedure, notProcedure, mapProcedure, reduceProcedure, identityProcedure, constantProcedure, throwProcedure, tryCatchProcedure, };
//# sourceMappingURL=index.d.ts.map