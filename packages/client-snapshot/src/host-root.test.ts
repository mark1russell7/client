/**
 * The snapshot procedures under the root of a host (roadmap R33, tracker items O36 and O46).
 *
 * - `snapshot.create` and `snapshot.diff` are confined. Their folders are in the root, and git goes
 *   through the `git.*` procedures, with the rules of the root. Pnpm does not start.
 * - A root refuses `snapshot.restore`, with the reason in its rules.
 * - `snapshot.list` and `snapshot.delete` reach only S3. Without a root, nothing changes.
 *
 * The tests run the real git in temporary folders, and the fake S3 of `test/fake-s3.ts`.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { createProcedure, createRegistry, defineModule, invokePath, outputValue, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { gitModule } from "@procedures/git/module";
import { snapshotModule } from "./module.js";
import { fakeS3, type FakeS3 } from "../test/fake-s3.js";
import type { SnapshotCreateOutput, SnapshotDiffOutput } from "./types.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let base: string;
let root: string;
let repo: string;
let s3: FakeS3;
let rooted: ProcedureRegistry;

/** The environment variables that the tests change, and restore after the tests. */
const ENV = ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_CEILING_DIRECTORIES"] as const;
const saved = new Map<string, string | undefined>();
let hostConfig: string;

/** This function runs git for the setup of a test, without a root. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** A repository with a local identity, one commit and the remote "origin". */
function initRepo(path: string): void {
  mkdirSync(path, { recursive: true });
  git(path, "init", "-q", "--initial-branch=main");
  for (const [key, value] of [
    ["user.name", "Test"],
    ["user.email", "test@example.com"],
    ["core.autocrlf", "false"],
    ["commit.gpgsign", "false"],
    ["maintenance.auto", "false"],
    ["gc.auto", "0"],
  ]) {
    git(path, "config", key!, value!);
  }
  writeFileSync(join(path, "a.txt"), "a\n");
  git(path, "add", "a.txt");
  git(path, "commit", "-q", "-m", "first");
  git(path, "remote", "add", "origin", "https://example.com/proj.git");
}

/** The procedures `s3.upload`, `s3.list` and `s3.download` of a fake S3, as a module of the host. */
function s3Module(fake: FakeS3): ProcedureModule {
  return defineModule(
    "fake-s3",
    ["upload", "list", "download"].map((name) =>
      createProcedure()
        .path(["s3", name])
        .input(z.looseObject({}))
        .output(z.unknown())
        .meta({ description: `The fake s3.${name}`, effects: { reads: ["s3", "network"], writes: ["s3", "network"] } })
        .handler(async (input: Record<string, unknown>) => fake.ctx.client.call(["s3", name], input))
        .build(),
    ),
  );
}

async function call<T>(key: string, input: unknown, at: ProcedureRegistry = rooted): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry: at }));
}

/** The refusal of a root: FORBIDDEN with the reason outside-root. */
async function expectRefused(key: string, input: unknown): Promise<void> {
  await expect(call(key, input), key).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
}

beforeAll(() => {
  for (const name of ENV) saved.set(name, process.env[name]);
  // The global and the system configurations of the machine do not apply to the setup
  const shared = mkdtempSync(join(tmpdir(), "snapshot-host-root-config-"));
  hostConfig = join(shared, "gitconfig");
  writeFileSync(hostConfig, "");
  process.env["GIT_CONFIG_GLOBAL"] = hostConfig;
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
  delete process.env["GIT_CEILING_DIRECTORIES"];
});

afterAll(() => {
  rmSync(dirname(hostConfig), { recursive: true, force: true });
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "snapshot-host-root-"));
  root = join(base, "root");
  repo = join(root, "proj");
  initRepo(repo);
  s3 = fakeS3();
  rooted = createRegistry(snapshotModule, gitModule, s3Module(s3));
  confineToRoot(rooted, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true, maxRetries: 5 });
});

describe("the snapshot procedures under the root of a host", () => {
  it("confine create and diff, refuse restore with a reason, and leave list and delete as they are", () => {
    const decisions = Object.fromEntries(snapshotModule.procedures.map((procedure) => [procedure.path.join("."), rootDecisionOf(procedure)]));
    expect(Object.fromEntries(Object.entries(decisions).map(([key, decision]) => [key, decision.kind]))).toEqual({
      "snapshot.create": "confined",
      "snapshot.list": "unchanged",
      "snapshot.restore": "refused",
      "snapshot.diff": "confined",
      "snapshot.delete": "unchanged",
    });
    expect(decisions["snapshot.restore"]?.reason).toContain("temporary folder");
    const rules = Object.fromEntries(snapshotModule.procedures.map((procedure) => [procedure.path.join("."), procedure.metadata.fsRoot]));
    expect(rules["snapshot.create"]).toEqual({ paths: ["paths"] });
    expect(rules["snapshot.diff"]).toEqual({ paths: ["paths"], required: ["paths"] });
  });

  it("create a snapshot of a repository in the root, with git through the git procedures and no pnpm", async () => {
    const created = await call<SnapshotCreateOutput>("snapshot.create", { name: "dev", bucket: "b", paths: ["proj"] });
    const [info] = created.metadata.repositories;
    expect(info).toMatchObject({
      path: repo,
      name: "proj",
      branch: "main",
      commit: git(repo, "rev-parse", "HEAD").trim(),
      remoteUrl: "https://example.com/proj.git",
      dirty: false,
      stashCount: 0,
    });
    expect(created.metadata.environment.pnpmVersion).toBe("unknown");
    expect([...s3.objects.keys()].sort()).toEqual([`snapshots/dev/${created.id}.metadata.json`, `snapshots/dev/${created.id}.tar.gz`]);
  });

  it("take the root as the default folder", async () => {
    const created = await call<SnapshotCreateOutput>("snapshot.create", { name: "dev", bucket: "b" });
    expect(created.metadata.repositories.map((info) => info.path)).toEqual([root]);
  });

  it("refuse a folder outside the root, and a repository whose configuration starts a program, before an upload", async () => {
    const outside = join(base, "outside");
    initRepo(outside);
    await expectRefused("snapshot.create", { name: "dev", bucket: "b", paths: [outside] });
    await expectRefused("snapshot.diff", { id: "dev-1", bucket: "b", paths: [outside] });

    // The refusal of git under the root stays the error: it does not read as "no repository"
    git(repo, "config", "core.pager", "less");
    await expectRefused("snapshot.create", { name: "dev", bucket: "b", paths: ["proj"] });
    expect(s3.objects.size).toBe(0);
  });

  it("diff a repository in the root through the git procedures, and need the paths", async () => {
    const created = await call<SnapshotCreateOutput>("snapshot.create", { name: "dev", bucket: "b", paths: ["proj"] });
    // The paths of the snapshot can come from another machine: under a root, the call names the folders
    await expectRefused("snapshot.diff", { id: created.id, bucket: "b" });

    const same = await call<SnapshotDiffOutput>("snapshot.diff", { id: created.id, bucket: "b", paths: ["proj"] });
    expect(same.summary).toEqual({ reposChanged: 0, totalFilesChanged: 0, isMatch: true });

    writeFileSync(join(repo, "b.txt"), "b\n");
    git(repo, "add", "b.txt");
    git(repo, "commit", "-q", "-m", "second");
    const changed = await call<SnapshotDiffOutput>("snapshot.diff", { id: created.id, bucket: "b", paths: ["proj"] });
    expect(changed.repositories[0]).toMatchObject({ path: repo, filesChanged: 1, commitDiff: { snapshot: created.metadata.repositories[0]!.commit } });
    expect(changed.summary).toEqual({ reposChanged: 1, totalFilesChanged: 1, isMatch: false });
  });

  it("do not read a package.json that is a symlink out of the root", async (context) => {
    const outside = join(base, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "package.json"), JSON.stringify({ name: "a-name-outside-the-root" }));
    try {
      symlinkSync(join(outside, "package.json"), join(repo, "package.json"));
    } catch {
      // Windows without the right to make a symlink
      context.skip();
    }
    const created = await call<SnapshotCreateOutput>("snapshot.create", { name: "dev", bucket: "b", paths: ["proj"] });
    expect(created.metadata.repositories[0]?.name).toBe("proj");
  });

  it("refuse a restore in the root, and start nothing", async () => {
    await expectRefused("snapshot.restore", { id: "x", bucket: "b", targetPath: join(root, "restored") });
    expect(existsSync(join(root, "restored"))).toBe(false);
    expect(readdirSync(root)).toEqual(["proj"]);
  });

  it("start the handlers without a root", async () => {
    const plain = createRegistry(snapshotModule);
    // The registry has no s3 procedures, so the restore fails at its first nested call, not at a root
    const error = await invokePath(["snapshot", "restore"], { id: "x", bucket: "b", targetPath: join(base, "restored") }, { registry: plain }).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toMatchObject({ code: "NOT_FOUND" });
  });
});
