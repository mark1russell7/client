/**
 * dag.traverse runs the git visits of one repository one at a time (deep dive DATA-17).
 * Before, four `git add` calls ran at once in one repository and failed on `index.lock`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, type ProcedureContext } from "@procedures/client";
import { dagModule } from "../module.js";
import { DagTraverseInputSchema, type ScanOutput } from "./types.js";
import { callsGit, dagTraverse, keyedLock, packageNodes, repositoryRoot } from "./traverse.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A workspace in one git repository, with independent packages. */
function workspace(names: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "dag-traverse-"));
  roots.push(root);
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  for (const name of names) {
    mkdirSync(join(root, "packages", name), { recursive: true });
    writeFileSync(join(root, "packages", name, "package.json"), JSON.stringify({ name }));
  }
  return root;
}

/**
 * The output of `lib.scan` for a workspace of `workspace()`. The real procedure is in
 * `@procedures/lib`, which depends on this package, so the test gives the fields that
 * `dag.traverse` reads.
 */
function scan(rootPath: string): ScanOutput {
  const dir = join(rootPath, "packages");
  const packages: ScanOutput["packages"] = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const { name } = JSON.parse(readFileSync(join(dir, entry.name, "package.json"), "utf8")) as { name: string };
    packages[name] = { name, repoPath: join(dir, entry.name), mark1russell7Deps: [] };
  }
  return { packages };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A context that serves lib.scan from the disk. Each visit procedure fails when another call of
 * it runs in the same repository, as git does with `index.lock`.
 */
function context(): { ctx: ProcedureContext; maxInFlight: () => number; calls: string[] } {
  const calls: string[] = [];
  let inFlight = 0;
  let max = 0;
  const locked = new Set<string>();
  const visit = async (input: { cwd: string }) => {
    const repo = repositoryRoot(input.cwd);
    inFlight++;
    max = Math.max(max, inFlight);
    try {
      if (locked.has(repo)) throw new Error("fatal: Unable to create '.git/index.lock': File exists.");
      locked.add(repo);
      await sleep(10);
      locked.delete(repo);
      return { ok: true };
    } finally {
      inFlight--;
    }
  };
  const handlers: Record<string, (input: Record<string, unknown>) => unknown> = {
    "lib.scan": ({ rootPath }) => scan(rootPath as string),
    "git.add": (input) => visit(input as { cwd: string }),
    "pnpm.build": (input) => visit(input as { cwd: string }),
  };
  const call = async (path: string[], input: Record<string, unknown>) => {
    calls.push(path.join("."));
    const handler = handlers[path.join(".")];
    if (!handler) throw new Error(`Unexpected procedure call: ${path.join(".")}`);
    return handler(input);
  };
  return { ctx: { client: { call } } as unknown as ProcedureContext, maxInFlight: () => max, calls };
}

describe("dag.traverse", () => {
  it("is the procedure of the dag module, and declares its call of lib.scan", () => {
    const procedure = createRegistry(dagModule).get(["dag", "traverse"]);
    expect(procedure?.handler).toBeDefined();
    expect(procedure?.metadata.calls).toEqual(["lib.scan"]);
    expect(procedure?.metadata.effects).toEqual({ reads: ["fs"], writes: [] });
    expect(procedure?.metadata.tags).toContain("runs-refs");
  });

  it("gets the packages from lib.scan", async () => {
    const root = workspace(["a", "b"]);
    const { ctx, calls } = context();
    const input = DagTraverseInputSchema.parse({ visit: ["pnpm", "build"], rootPath: root });

    const result = await dagTraverse(input, ctx);

    expect(calls[0]).toBe("lib.scan");
    expect(result.results.map((entry) => entry.name).sort()).toEqual(["a", "b"]);
  });

  it("makes an edge only for a dependency that the scan found", () => {
    const nodes = packageNodes({
      a: { name: "a", repoPath: "/w/a", mark1russell7Deps: [] },
      b: { name: "b", repoPath: "/w/b", mark1russell7Deps: ["a", "missing"] },
    });
    expect(nodes.get("b")).toEqual({ id: "b", name: "b", repoPath: "/w/b", dependencies: ["a"] });
  });

  it("runs git visits in one repository one at a time", async () => {
    const root = workspace(["a", "b", "c", "d", "e"]);
    const { ctx, maxInFlight } = context();
    const input = DagTraverseInputSchema.parse({ visit: ["git", "add"], rootPath: root, continueOnError: true });

    const result = await dagTraverse(input, ctx);

    expect(result.failed).toBe(0);
    expect(result.visited).toBe(5);
    expect(maxInFlight()).toBe(1);
  });

  it("also serializes a $proc visit whose nested refs call git", () => {
    expect(callsGit({ $proc: ["client", "chain"], input: { steps: [{ $proc: ["git", "add"] }] } })).toBe(true);
    expect(callsGit(["pnpm", "build"])).toBe(false);
  });

  it("runs other visits in parallel", async () => {
    const root = workspace(["a", "b", "c", "d"]);
    const { ctx, maxInFlight } = context();
    const input = DagTraverseInputSchema.parse({ visit: ["pnpm", "build"], rootPath: root, continueOnError: true });

    await dagTraverse(input, ctx);

    expect(maxInFlight()).toBeGreaterThan(1);
  });
});

describe("keyedLock", () => {
  it("runs tasks of one key in order and tasks of other keys in parallel", async () => {
    const lock = keyedLock();
    const events: string[] = [];
    const task = (name: string, ms: number) => async () => {
      events.push(`start ${name}`);
      await sleep(ms);
      events.push(`end ${name}`);
    };
    await Promise.all([lock("r", task("a1", 20)), lock("r", task("a2", 1)), lock("s", task("b", 1))]);
    expect(events.indexOf("end a1")).toBeLessThan(events.indexOf("start a2"));
    expect(events.indexOf("start b")).toBeLessThan(events.indexOf("end a1"));
  });
});
