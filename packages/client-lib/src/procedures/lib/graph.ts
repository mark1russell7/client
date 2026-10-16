/**
 * lib.graph procedure (roadmap R44)
 *
 * The dependency graph of the workspace packages (`<root>/packages/*`): one node for each
 * package, and one edge for each dependency with a `workspace:` specifier. The procedure finds
 * the cycles (the strongly connected components, and a package that depends on itself). Without
 * a cycle, it also gives the levels of a build order. It only reads, through `fs.readdir` and
 * `fs.read.json`, so a root of the host confines it as it confines `lib.scan`.
 */

import { join } from "node:path";
import { buildLeveledDAG, type DAGNode } from "@procedures/dag";
import type { ProcedureContext } from "@procedures/client";
import type { DependencyKind, LibGraphEdge, LibGraphInput, LibGraphNode, LibGraphOutput } from "../../types.js";
import { packagesDir, resolveWorkspaceRoot } from "../../workspace.js";

const KINDS: readonly DependencyKind[] = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

interface PackageJson {
  name?: unknown;
  version?: unknown;
  private?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface FsReaddirOutput {
  entries: Array<{ name: string; type: string }>;
}

/**
 * The cycles of a graph: each strongly connected component with more than one node, and each
 * node with an edge to itself (Tarjan's algorithm). Each cycle and the list are in name order.
 */
export function findCycles(names: readonly string[], edges: ReadonlyMap<string, readonly string[]>): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];

  const visit = (name: string): void => {
    index.set(name, counter);
    low.set(name, counter);
    counter++;
    stack.push(name);
    onStack.add(name);
    for (const next of edges.get(name) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(name, Math.min(low.get(name)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(name, Math.min(low.get(name)!, index.get(next)!));
      }
    }
    if (low.get(name) === index.get(name)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== name);
      const selfEdge = component.length === 1 && (edges.get(name) ?? []).includes(name);
      if (component.length > 1 || selfEdge) cycles.push(component.sort());
    }
  };

  for (const name of names) if (!index.has(name)) visit(name);
  return cycles.sort((a, b) => a[0]!.localeCompare(b[0]!));
}

/**
 * The dependency graph of the workspace packages
 */
export async function libGraph(input: LibGraphInput, ctx: ProcedureContext): Promise<LibGraphOutput> {
  const root = resolveWorkspaceRoot(input.rootPath);
  const dir = packagesDir(root);
  const warnings: LibGraphOutput["warnings"] = [];
  const listing = await ctx.client.call<{ path: string }, FsReaddirOutput>(["fs", "readdir"], { path: dir });

  const packages: Array<{ folder: string; manifest: PackageJson }> = [];
  for (const entry of listing.entries.filter((item) => item.type === "directory").sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name, "package.json");
    try {
      const { data } = await ctx.client.call<{ path: string }, { data: unknown }>(["fs", "read.json"], { path });
      const manifest = data as PackageJson;
      if (typeof manifest.name !== "string" || manifest.name.length === 0) {
        warnings.push({ path, issue: "package.json has no name" });
        continue;
      }
      packages.push({ folder: entry.name, manifest });
    } catch (error) {
      warnings.push({ path, issue: `Failed to read package.json: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  const names = new Set(packages.map((pkg) => pkg.manifest.name as string));
  const nodes: LibGraphNode[] = [];
  const edges: LibGraphEdge[] = [];
  const adjacency = new Map<string, string[]>();
  for (const { folder, manifest } of packages) {
    const name = manifest.name as string;
    const node: LibGraphNode = { name, folder };
    if (typeof manifest.version === "string") node.version = manifest.version;
    if (typeof manifest.private === "boolean") node.private = manifest.private;
    nodes.push(node);
    const targets = new Set<string>();
    for (const kind of KINDS) {
      for (const [dependency, spec] of Object.entries(manifest[kind] ?? {})) {
        if (typeof spec !== "string" || !spec.startsWith("workspace:")) continue;
        if (!names.has(dependency)) {
          warnings.push({ path: join(dir, folder, "package.json"), issue: `${dependency} (${spec}) is not a package of the workspace` });
          continue;
        }
        edges.push({ from: name, to: dependency, kind, spec });
        targets.add(dependency);
      }
    }
    adjacency.set(name, [...targets].sort());
  }
  nodes.sort((a, b) => a.name.localeCompare(b.name));

  const cycles = findCycles(nodes.map((node) => node.name), adjacency);
  const output: LibGraphOutput = { root, nodes, edges, acyclic: cycles.length === 0, cycles, warnings };
  if (cycles.length === 0) {
    const dagNodes = new Map<string, DAGNode>(nodes.map((node) => [node.name, { id: node.name, dependencies: adjacency.get(node.name) ?? [] }]));
    output.levels = buildLeveledDAG(dagNodes).levels.map((level) => level.map((node) => node.id).sort());
  }
  return output;
}
