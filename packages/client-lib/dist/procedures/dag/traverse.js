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
import { isAnyProcedureRef, hydrateInput } from "@mark1russell7/client";
import { libScan } from "../lib/scan.js";
import { buildDAGNodes, buildLeveledDAG, executeDAG, createProcessor, filterDAGFromRoot, } from "../../dag/index.js";
/**
 * Execute a DAG traversal with a custom visit procedure
 */
export async function dagTraverse(input, ctx) {
    const startTime = Date.now();
    const results = [];
    // Scan for all packages
    const scanResult = await libScan({}, ctx);
    let allNodes = buildDAGNodes(scanResult.packages);
    // Filter to specific packages if requested
    if (input.filter && input.filter.length > 0) {
        const filtered = new Map();
        for (const name of input.filter) {
            const node = allNodes.get(name);
            if (node) {
                filtered.set(name, node);
            }
        }
        allNodes = filtered;
    }
    // Filter to root and its dependencies if requested
    if (input.root) {
        const rootNode = allNodes.get(input.root);
        if (!rootNode) {
            return {
                success: false,
                results: [],
                totalDuration: Date.now() - startTime,
                visited: 0,
                failed: 0,
            };
        }
        allNodes = filterDAGFromRoot(allNodes, input.root);
    }
    // Build DAG for dependency-ordered execution
    const dag = buildLeveledDAG(allNodes);
    // Determine how to execute the visit procedure
    // visit can be:
    // - Array: procedure path like ["git", "add"]
    // - $proc ref: { $proc: [...], input: {...}, $when: "$parent" }
    const visitIsRef = isAnyProcedureRef(input.visit);
    let visitPath;
    let baseInput = {};
    if (Array.isArray(input.visit)) {
        visitPath = input.visit;
    }
    else if (visitIsRef && typeof input.visit === "object" && "$proc" in input.visit) {
        visitPath = input.visit.$proc;
        baseInput = input.visit.input ?? {};
    }
    else {
        throw new Error("visit must be a procedure path or $proc reference with $when");
    }
    // Create processor that executes visit procedure per node
    const processor = createProcessor(async (node) => {
        if (input.dryRun) {
            results.push({
                name: node.name,
                path: node.repoPath,
                success: true,
                duration: 0,
                output: { dryRun: true, wouldExecute: visitPath },
            });
            return;
        }
        const nodeStartTime = Date.now();
        try {
            // Merge base input with node context
            const visitInput = {
                ...(typeof baseInput === "object" ? baseInput : {}),
                cwd: node.repoPath,
                node: {
                    name: node.name,
                    path: node.repoPath,
                    dependencies: node.dependencies,
                },
            };
            // Create executor for hydration that injects cwd into every call
            const executor = async (path, inp) => {
                // Inject cwd into the input so nested procedures run in correct directory
                const inputWithCwd = typeof inp === "object" && inp !== null
                    ? { ...inp, cwd: node.repoPath }
                    : inp;
                return ctx.client.call(path, inputWithCwd);
            };
            // Hydrate the input (execute any nested procedure refs like chain steps)
            // Push "dag.traverse" onto context stack so refs with $when: "dag.traverse" execute
            const hydratedInput = await hydrateInput(visitInput, executor, {
                contextStack: ["dag.traverse"],
            });
            // Execute visit procedure with hydrated input
            const output = await ctx.client.call(visitPath, hydratedInput);
            results.push({
                name: node.name,
                path: node.repoPath,
                success: true,
                duration: Date.now() - nodeStartTime,
                output,
            });
        }
        catch (error) {
            const result = {
                name: node.name,
                path: node.repoPath,
                success: false,
                duration: Date.now() - nodeStartTime,
                error: error instanceof Error ? error.message : String(error),
            };
            results.push(result);
            throw error; // Re-throw for DAG executor to handle
        }
    });
    // Execute DAG traversal
    const dagResult = await executeDAG(dag, processor, {
        concurrency: input.concurrency ?? 4,
        failFast: !input.continueOnError,
    });
    // If dry run, we already populated results in the processor
    if (!input.dryRun) {
        // Ensure all nodes have results (some may have been skipped due to errors)
        for (const [name, nodeResult] of dagResult.results) {
            const existing = results.find((r) => r.name === name);
            if (!existing) {
                const node = allNodes.get(name);
                const result = {
                    name,
                    path: node?.repoPath ?? "unknown",
                    success: nodeResult.success,
                    duration: nodeResult.duration,
                };
                if (nodeResult.error?.message) {
                    result.error = nodeResult.error.message;
                }
                results.push(result);
            }
        }
    }
    return {
        success: dagResult.success,
        results,
        totalDuration: Date.now() - startTime,
        visited: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
    };
}
//# sourceMappingURL=traverse.js.map