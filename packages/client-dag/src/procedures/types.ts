/**
 * The types and schemas of the `dag.traverse` procedure.
 *
 * The procedure came from `@procedures/lib` (roadmap, items for a decision). Its name stays
 * `dag.traverse`.
 */

import { z } from "zod";
import type { DAGNode } from "../types.js";

/**
 * Schema for $proc references with $when control.
 */
const ProcRefSchema: z.ZodObject<{
  $proc: z.ZodArray<z.ZodString>;
  input: z.ZodOptional<z.ZodUnknown>;
  $when: z.ZodOptional<z.ZodString>;
  $name: z.ZodOptional<z.ZodString>;
}> = z.object({
  $proc: z.array(z.string()),
  input: z.unknown().optional(),
  $when: z.string().optional(),
  $name: z.string().optional(),
});

export const DagTraverseInputSchema: z.ZodObject<{
  visit: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, typeof ProcRefSchema]>;
  filter: z.ZodOptional<z.ZodArray<z.ZodString>>;
  root: z.ZodOptional<z.ZodString>;
  rootPath: z.ZodOptional<z.ZodString>;
  concurrency: z.ZodDefault<z.ZodNumber>;
  serialize: z.ZodDefault<z.ZodEnum<{ auto: "auto"; repository: "repository"; none: "none" }>>;
  continueOnError: z.ZodDefault<z.ZodBoolean>;
  dryRun: z.ZodDefault<z.ZodBoolean>;
}> = z.object({
  /**
   * The procedure to start for each node.
   * - A list: a procedure path, for example ["git", "add"]
   * - A `$proc` ref with `$when: "$never"` or `"$parent"`: deferred. The traversal starts it for each node.
   *
   * Example:
   * ```json
   * { "$proc": ["git", "add"], "input": { "all": true }, "$when": "$parent" }
   * ```
   */
  visit: z.union([
    z.array(z.string()),
    ProcRefSchema,
  ]).describe("Procedure to execute for each node. - Array: procedure path, e.g., [\"git\", \"add\"] - $proc with $when: \"$never\" or \"$parent\": deferred, executed per-node Example: ```json { \"$proc\": [\"git\", \"add\"], \"input\": { \"all\": true }, \"$when\": \"$parent\" } ```"),
  /** Filter to specific package names */
  filter: z.array(z.string()).optional().describe("Filter to specific package names"),
  /** Start from specific root package */
  root: z.string().optional().describe("Start from specific root package"),
  /** The workspace root that `lib.scan` reads (default: the pnpm workspace that contains client-lib) */
  rootPath: z.string().optional().describe("Workspace root (defaults to the pnpm workspace that contains client-lib)"),
  /** Max parallel operations (default: 4) */
  concurrency: z.number().default(4).describe("Max parallel operations (default: 4)"),
  /**
   * When the visits of nodes in one git repository start one at a time (default: "auto").
   * - "auto": when the visit uses a `git` procedure (git locks the index of the repository)
   * - "repository": always
   * - "none": not at any time
   */
  serialize: z.enum(["auto", "repository", "none"]).default("auto").describe("When the visits of nodes in one git repository run one at a time (default: \"auto\"). - \"auto\": when the visit calls a `git` procedure (git locks the index of the repository) - \"repository\": always - \"none\": never"),
  /** Continue on error (default: false) */
  continueOnError: z.boolean().default(false).describe("Continue on error (default: false)"),
  /** Give the plan only, and start no visit (default: false) */
  dryRun: z.boolean().default(false).describe("Preview without executing (default: false)"),
});

export type DagTraverseInput = z.infer<typeof DagTraverseInputSchema>;

/**
 * The result of one node. A node that the traversal did not visit has `skipped: true`,
 * `success: false` and a `reason`.
 */
export interface TraverseNodeResult {
  name: string;
  path: string;
  success: boolean;
  duration: number;
  error?: string | undefined;
  output?: unknown | undefined;
  /** True when the traversal did not start the visit of the node */
  skipped?: boolean | undefined;
  /** The reason that the traversal did not start the visit, with `skipped` */
  reason?: string | undefined;
}

export interface DagTraverseOutput {
  success: boolean;
  /** The result of each node of the graph: the visited nodes, then the skipped nodes */
  results: TraverseNodeResult[];
  totalDuration: number;
  /** The number of visits that succeeded */
  visited: number;
  /** The number of visits that failed. A skipped node is not in this number. */
  failed: number;
  /** The number of nodes that the traversal did not visit */
  skipped: number;
}

export const DagTraverseOutputSchema: z.ZodType<DagTraverseOutput> = z.looseObject({
  success: z.boolean().describe("True when every visit succeeded"),
  results: z
    .array(
      z.looseObject({
        name: z.string().describe("The package name of the node"),
        path: z.string().describe("The folder of the node"),
        success: z.boolean().describe("True when the visit succeeded"),
        duration: z.number().describe("The time of the visit, in milliseconds"),
        error: z.string().optional().describe("The error of a failed visit"),
        output: z.unknown().optional().describe("The result of the visit"),
        skipped: z
          .boolean()
          .optional()
          .describe("True when the traversal did not start the visit, because an earlier visit failed and continueOnError is false"),
        reason: z.string().optional().describe("The reason that the traversal did not start the visit of a skipped node"),
      })
    )
    .describe("The result of each node of the graph: the visited nodes, then the skipped nodes"),
  totalDuration: z.number().describe("The time of the traversal, in milliseconds"),
  visited: z.number().describe("The number of visits that succeeded"),
  failed: z.number().describe("The number of visits that failed. A skipped node is not in this number."),
  skipped: z.number().describe("The number of nodes that the traversal did not visit"),
});

/**
 * A package of the output of `lib.scan`: the fields that `dag.traverse` reads. The type is local,
 * because `@procedures/lib` depends on this package, and this package must not depend on it.
 */
export interface ScannedPackage {
  /** The package name */
  name: string;
  /** The folder of the package */
  repoPath: string;
  /** The ecosystem packages that the package depends on */
  mark1russell7Deps: string[];
}

/** The output of `lib.scan`: the fields that `dag.traverse` reads. */
export interface ScanOutput {
  packages: Record<string, ScannedPackage>;
}

/** A node of the traversal: a workspace package. `id` is the package name. */
export interface PackageNode extends DAGNode {
  /** The package name. It is the same as `id`. */
  name: string;
  /** The folder of the package */
  repoPath: string;
}
