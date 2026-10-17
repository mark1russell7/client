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
 *
 * The procedure gets the packages of the workspace from `lib.scan` of `@procedures/lib`, through
 * `ctx.client`. It does not import that package, because `@procedures/lib` depends on this one.
 * Thus a registry with `dag.traverse` also needs the module of `@procedures/lib`.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ProcedureContext, ProcedurePath } from "@procedures/client";
import { isAnyProcedureRef, hydrateInput, scopeOf } from "@procedures/client";
import type {
  DagTraverseInput,
  DagTraverseOutput,
  PackageNode,
  ScanOutput,
  TraverseNodeResult,
} from "./types.js";
import {
  buildLeveledDAG,
  executeDAG,
  createProcessor,
  filterDAGFromRoot,
} from "../dag/index.js";

/**
 * This function gives the nodes of the packages of a `lib.scan` output. A dependency on a
 * package that the scan did not find is not an edge.
 */
export function packageNodes(packages: ScanOutput["packages"]): Map<string, PackageNode> {
  const nodes = new Map<string, PackageNode>();
  for (const [name, info] of Object.entries(packages)) {
    nodes.set(name, {
      id: name,
      name,
      repoPath: info.repoPath,
      dependencies: info.mark1russell7Deps.filter((dep) => packages[dep] !== undefined),
    });
  }
  return nodes;
}

/** The folder of the git repository that holds `path` (it has `.git`), or `path` itself. */
export function repositoryRoot(path: string): string {
  let current = resolve(path);
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(path);
    current = parent;
  }
}

/** True when the value names a `git` procedure: a path, or a `$proc` ref at any depth. */
export function callsGit(value: unknown): boolean {
  if (Array.isArray(value)) {
    if (value[0] === "git" && value.every((part) => typeof part === "string")) return true;
    return value.some(callsGit);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(callsGit);
  }
  return false;
}

/**
 * Run the tasks of one key one at a time, in the order of the calls. Tasks of other keys run
 * in parallel.
 */
export function keyedLock(): <T>(key: string, task: () => Promise<T>) => Promise<T> {
  const tails = new Map<string, Promise<void>>();
  return async <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const done = new Promise<void>((resolveDone) => {
      release = resolveDone;
    });
    const tail = previous.then(() => done);
    tails.set(key, tail);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (tails.get(key) === tail) tails.delete(key);
    }
  };
}

/**
 * Execute a DAG traversal with a custom visit procedure
 *
 * The visits of nodes in one git repository run one at a time when the visit calls git (or
 * with `serialize: "repository"`). All the packages of a workspace share one repository, and
 * concurrent `git add` calls failed on `index.lock` (deep dive DATA-17).
 */
export async function dagTraverse(
  input: DagTraverseInput,
  ctx: ProcedureContext
): Promise<DagTraverseOutput> {
  const startTime = Date.now();
  const results: TraverseNodeResult[] = [];

  // Scan for all packages (lib.scan of @procedures/lib)
  const scanResult = await ctx.client.call<{ rootPath?: string }, ScanOutput>(
    ["lib", "scan"],
    input.rootPath !== undefined ? { rootPath: input.rootPath } : {}
  );
  let allNodes = packageNodes(scanResult.packages);

  // Filter to specific packages if requested
  if (input.filter && input.filter.length > 0) {
    const filtered = new Map<string, PackageNode>();
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
        skipped: 0,
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
  let visitPath: ProcedurePath;
  let baseInput: unknown = {};

  if (Array.isArray(input.visit)) {
    visitPath = input.visit;
  } else if (visitIsRef && typeof input.visit === "object" && "$proc" in input.visit) {
    visitPath = input.visit.$proc;
    baseInput = input.visit.input ?? {};
  } else {
    throw new Error("visit must be a procedure path or $proc reference with $when");
  }

  const serialize = input.serialize ?? "auto";
  const oneAtATime = serialize === "repository" || (serialize === "auto" && callsGit(input.visit));
  const lock = keyedLock();

  // Create processor that executes visit procedure per node
  const processor = createProcessor(async (node: PackageNode) => {
    if (oneAtATime) {
      await lock(repositoryRoot(node.repoPath), () => visit(node));
    } else {
      await visit(node);
    }
  });

  async function visit(node: PackageNode): Promise<void> {
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
      const executor = async <TIn, TOut>(path: ProcedurePath, inp: TIn): Promise<TOut> => {
        // Inject cwd into the input so nested procedures run in correct directory
        const inputWithCwd = typeof inp === "object" && inp !== null
          ? { ...inp, cwd: node.repoPath }
          : inp;
        return ctx.client.call(path, inputWithCwd) as Promise<TOut>;
      };

      // Hydrate the input (execute any nested procedure refs like chain steps)
      // Push "dag.traverse" onto context stack so refs with $when: "dag.traverse" execute
      const hydratedInput = await hydrateInput(visitInput, executor, {
        contextStack: ["dag.traverse"],
        onRef: ctx.onRef,
        // The names of the chain around this procedure: a `$ref` in the visit can read them
        scope: scopeOf(input),
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
    } catch (error) {
      const result: TraverseNodeResult = {
        name: node.name,
        path: node.repoPath,
        success: false,
        duration: Date.now() - nodeStartTime,
        error: error instanceof Error ? error.message : String(error),
      };
      results.push(result);
      throw error; // Re-throw for DAG executor to handle
    }
  }

  // Execute DAG traversal
  const dagResult = await executeDAG(dag, processor, {
    concurrency: input.concurrency ?? 4,
    failFast: !input.continueOnError,
  });

  const skipped = skippedResults(dag.levels.flat(), results, dagResult.failedNodes);

  return {
    success: dagResult.success,
    results: [...results, ...skipped],
    totalDuration: Date.now() - startTime,
    visited: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    skipped: skipped.length,
  };
}

/**
 * This function gives one result for each node without a result, in the order of the levels.
 * Each visit records its own result. Thus a node without a result is in a level that
 * `executeDAG` did not start. An earlier visit failed, and `failFast` stopped the traversal.
 */
export function skippedResults(
  nodes: readonly PackageNode[],
  results: readonly TraverseNodeResult[],
  failedNodes: readonly string[]
): TraverseNodeResult[] {
  const done = new Set(results.map((result) => result.name));
  const reason =
    `The visit of ${failedNodes.join(", ")} failed, and the traversal stopped before this package ` +
    "(continueOnError is false)";
  return nodes
    .filter((node) => !done.has(node.name))
    .map((node) => ({ name: node.name, path: node.repoPath, success: false, duration: 0, skipped: true, reason }));
}
