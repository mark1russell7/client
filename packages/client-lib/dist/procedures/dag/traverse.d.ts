/**
 * dag.traverse procedure
 *
 * General-purpose DAG traversal that executes a visit procedure
 * for each node in dependency order.
 *
 * This enables declarative composition of traversals:
 * ```typescript
 * // Execute git add on all packages (using $when: "$parent")
 * await client.exec({
 *   $proc: ["dag", "traverse"],
 *   input: {
 *     visit: {
 *       $proc: ["git", "add"],
 *       input: { all: true },
 *       $when: "$parent"  // Defer to dag.traverse
 *     }
 *   }
 * });
 *
 * // Simple form with just procedure path
 * await client.exec({
 *   $proc: ["dag", "traverse"],
 *   input: {
 *     visit: ["git", "add"]
 *   }
 * });
 * ```
 *
 * The `$when` field controls when nested $proc refs are executed:
 * - "$immediate" (default): Execute during hydration
 * - "$parent": Defer to parent procedure (dag.traverse executes per-node)
 * - "$never": Never auto-execute, pass as pure data
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { DagTraverseInput, DagTraverseOutput } from "../../types.js";
/**
 * Execute a DAG traversal with a custom visit procedure
 */
export declare function dagTraverse(input: DagTraverseInput, ctx: ProcedureContext): Promise<DagTraverseOutput>;
//# sourceMappingURL=traverse.d.ts.map