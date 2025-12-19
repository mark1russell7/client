/**
 * dag.traverse procedure
 *
 * General-purpose DAG traversal that executes a visit procedure
 * for each node in dependency order.
 *
 * This enables declarative composition of traversals:
 * ```typescript
 * // Execute git pull on all packages
 * await client.exec({
 *   $proc: ["dag", "traverse"],
 *   input: {
 *     visit: { $proc: ["git", "pull"], input: {} }
 *   }
 * });
 *
 * // Chain multiple operations per package
 * await client.exec({
 *   $proc: ["dag", "traverse"],
 *   input: {
 *     visit: {
 *       $proc: ["client", "chain"],
 *       input: {
 *         steps: [
 *           { $proc: ["git", "add"], input: { all: true } },
 *           { $proc: ["git", "commit"], input: { message: "auto" } },
 *         ]
 *       }
 *     }
 *   }
 * });
 * ```
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { DagTraverseInput, DagTraverseOutput } from "../../types.js";
/**
 * Execute a DAG traversal with a custom visit procedure
 */
export declare function dagTraverse(input: DagTraverseInput, ctx: ProcedureContext): Promise<DagTraverseOutput>;
//# sourceMappingURL=traverse.d.ts.map