/**
 * core.catch procedure
 *
 * Wraps a procedure execution with error handling.
 * The `try` procedure ref should use `$when: "catch"` so it's not
 * executed during hydration but instead by this procedure.
 *
 * @example
 * ```typescript
 * {
 *   $proc: ["core", "catch"],
 *   input: {
 *     try: {
 *       $proc: ["git", "commit"],
 *       input: { message: "auto" },
 *       $when: "catch"  // Defer execution to catch procedure
 *     },
 *     handler: {
 *       $proc: ["core", "identity"],
 *       input: { value: { continue: true } },
 *       $when: "catch"
 *     }
 *   }
 * }
 * ```
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { CoreCatchInput, CoreCatchOutput } from "../../types.js";
/**
 * Execute a procedure with error handling
 */
export declare function coreCatch(input: CoreCatchInput, ctx: ProcedureContext): Promise<CoreCatchOutput>;
//# sourceMappingURL=catch.d.ts.map