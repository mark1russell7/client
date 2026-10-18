/**
 * The programs of the snapshot procedures. Git goes through the `git.*` procedures of the host
 * (`gitCall`), so a root of the files confines it (tracker item O46). Pnpm starts through
 * runCommand: async, with the signal, and no shell. Under a root, pnpm does not start.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureContext, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot } from "@procedures/fs/module";
import { gitModule } from "@procedures/git/module";
import { gitCall, pnpmVersion } from "./commands.js";

vi.setConfig({ testTimeout: 60_000 });

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A context whose client starts the procedures of a registry, as the host gives it to a handler. */
function contextOf(registry: ProcedureRegistry): ProcedureContext {
  const call = async (path: string[], input: unknown) => outputValue(await invokePath(path, input, { registry }), path);
  return { client: { call } } as unknown as ProcedureContext;
}

const plain = contextOf(createRegistry(gitModule));

/** A git repository with one commit and the remote "origin". */
function repository(): string {
  const dir = mkdtempSync(join(tmpdir(), "snapshot-git-"));
  dirs.push(dir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(join(dir, "a.txt"), "a\n");
  git("add", "a.txt");
  git("commit", "-q", "-m", "first");
  git("remote", "add", "origin", "https://example.com/proj.git");
  return dir;
}

describe("snapshot commands", () => {
  it("reads the commit and the remote of a repository through the git procedures", async () => {
    const dir = repository();
    expect((await gitCall<{ value: string }>(plain, ["git", "revParse"], { cwd: dir }))?.value).toMatch(/^[0-9a-f]{40}$/);
    expect((await gitCall<{ url: string }>(plain, ["git", "remote"], { cwd: dir, name: "origin" }))?.url).toBe("https://example.com/proj.git");
  });

  it("gives undefined for a failed procedure, and passes each argument as it is: shell syntax runs nothing", async () => {
    const dir = repository();
    expect(await gitCall(plain, ["git", "remote"], { cwd: dir, name: "upstream" })).toBeUndefined();
    expect(await gitCall(plain, ["git", "revParse"], { cwd: dir, ref: "HEAD & echo injected" })).toBeUndefined();
  });

  it("keeps a refusal of the root as the error", async () => {
    const dir = repository();
    const root = mkdtempSync(join(tmpdir(), "snapshot-root-"));
    dirs.push(root);
    const rooted = createRegistry(gitModule);
    confineToRoot(rooted, root);
    await expect(gitCall(contextOf(rooted), ["git", "revParse"], { cwd: dir })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
  });

  it("reads the pnpm version, and starts no pnpm under a root", async () => {
    expect(await pnpmVersion()).toMatch(/^\d+\.\d+\.\d+/);
    expect(await pnpmVersion(undefined, tmpdir())).toBe("unknown");
  });
});
