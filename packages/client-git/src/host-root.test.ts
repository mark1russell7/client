/**
 * The git procedures under the root of a host (roadmap R33): a root refuses each of them, also for
 * a working folder in the root. Git looks for the repository above the working folder, and the
 * configuration of a repository can start a program. Without a root, they run as before. The
 * tests run the real `git` in a temporary folder, without the network.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { gitModule } from "./module.js";
import type { GitInitOutput } from "./types.js";

let base: string;
let root: string;
let rooted: ProcedureRegistry;

async function call<T>(key: string, input: unknown, at: ProcedureRegistry): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry: at }));
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "git-host-root-"));
  root = join(base, "root");
  mkdirSync(join(root, "repo"), { recursive: true });
  rooted = createRegistry(gitModule);
  confineToRoot(rooted, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the git procedures under the root of a host", () => {
  it("are all refused", () => {
    const kinds = new Set(gitModule.procedures.map((procedure) => rootDecisionOf(procedure).kind));
    expect([...kinds]).toEqual(["refused"]);
    expect(rootDecisionOf(gitModule.procedures[0]!).reason).toContain("core.fsmonitor");
  });

  it("refuse a working folder in the root and one outside it, and start no git", async () => {
    for (const cwd of [join(root, "repo"), base]) {
      await expect(call("git.init", { cwd }, rooted)).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
    await expect(call("git.status", {}, rooted)).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    expect(existsSync(join(root, "repo", ".git"))).toBe(false);
  });

  it("run without a root", async () => {
    const plain = createRegistry(gitModule);
    const init = await call<GitInitOutput>("git.init", { cwd: join(root, "repo"), initialBranch: "main" }, plain);
    expect(init.created).toBe(true);
    expect(existsSync(join(root, "repo", ".git"))).toBe(true);
  });
});
