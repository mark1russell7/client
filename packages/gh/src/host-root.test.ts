/**
 * The gh procedures under the root of a host (roadmap R33, tracker item O36). Each one is
 * confined: gh runs in a working folder of the root, and its nested `shell.run` is the call of a
 * confined procedure. Under a root, `GIT_DIR` is the null device, so the git of gh finds no
 * repository. `gh.run.download` writes in a folder of the root. A fake `shell.run` with the rules
 * of the real one records each call. Without a root, nothing changes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { fakeShell } from "@procedures/shell/testing";
import { ghModule } from "./module.js";

let base: string;
let root: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "gh-host-root-"));
  root = join(base, "root");
  mkdirSync(root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

/** A registry with a fake shell.run that has the rules of the real one, with or without a root. */
function fake(withRoot: boolean) {
  const shell = fakeShell({ stdout: "[]" });
  const registry: ProcedureRegistry = createRegistry(shell.module, ghModule);
  if (withRoot) confineToRoot(registry, root);
  const call = async <T>(key: string, input: unknown): Promise<T> => outputValue(await invokePath<T>(key.split("."), input, { registry }));
  return { calls: shell.calls, call };
}

describe("the gh procedures under the root of a host", () => {
  it("are all confined, with the working folder as their rule", () => {
    const kinds = new Set(ghModule.procedures.filter((p) => p.path[0] === "gh").map((p) => rootDecisionOf(p).kind));
    expect([...kinds]).toEqual(["confined"]);
    const rules = Object.fromEntries(ghModule.procedures.map((p) => [p.path.join("."), p.metadata.fsRoot]));
    expect(rules["gh.pr.list"]).toEqual({ cwd: "cwd" });
    expect(rules["gh.run.download"]).toEqual({ cwd: "cwd", names: ["dir"] });
  });

  it("run gh in the root, with no repository for its git", async () => {
    const { calls, call } = fake(true);
    await call("gh.pr.list", { repo: "owner/name" });
    await call("gh.issue.list", { repo: "owner/name", cwd: "." });
    expect(calls.map((each) => each.cwd)).toEqual([root, root]);
    expect(calls.map((each) => each.env?.["GIT_DIR"])).toEqual([devNull, devNull]);
    // gh.api keeps its own variables
    await call("gh.api", { endpoint: "repos/owner/name", repo: "owner/name" });
    expect(calls[2]?.env).toEqual({ GH_REPO: "owner/name", GIT_DIR: devNull });
  });

  it("refuse a working folder or a download folder outside the root, and start no gh", async () => {
    const { calls, call } = fake(true);
    for (const [key, input] of [
      ["gh.pr.list", { cwd: base }],
      ["gh.pr.view", { pr: "1", cwd: "../" }],
      ["gh.run.download", { run: 1, dir: "../artifacts" }],
      ["gh.run.download", { run: 1, dir: join(base, "artifacts") }],
    ] as const) {
      await expect(call(key, input), key).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
    expect(calls).toEqual([]);
    await call("gh.run.download", { run: 1, dir: "artifacts", repo: "owner/name" });
    expect(calls[0]).toMatchObject({ cwd: root, args: expect.arrayContaining(["--dir", "artifacts"]) });
  });

  it("run gh as before without a root", async () => {
    const { calls, call } = fake(false);
    await call("gh.pr.list", { repo: "owner/name" });
    expect(calls[0]?.cwd).toBeUndefined();
    expect(calls[0]?.env).toBeUndefined();
  });
});
