/**
 * The git procedures under the root of a host (roadmap R33, tracker item O35). Each of them is
 * confined: the working folder is in the root, git finds no repository above the root, the hooks
 * and `core.fsmonitor` do not run, and a configuration that starts a program is refused. Without
 * a root, they run as before. The tests run the real `git` in temporary folders, without the
 * network.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { resolveRoot } from "@procedures/fs/root";
import { gitModule } from "./module.js";
import { ceilingOf, confinedGitCommand, currentGitRoot, isRefusedConfigKey, parseConfigList, refusedConfigKeys, underGitRoot } from "./procedures/git/root.js";
import type { GitCommitOutput, GitInitOutput, GitLogOutput, GitStatusOutput } from "./types.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let base: string;
let root: string;
let rooted: ProcedureRegistry;
const plain = createRegistry(gitModule);

/** The environment variables that the tests change, and restore after the tests. */
const ENV = ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_CEILING_DIRECTORIES"] as const;
const saved = new Map<string, string | undefined>();

async function call<T>(key: string, input: unknown, at: ProcedureRegistry = rooted): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry: at }));
}

/** This function runs git for the setup of a test, without a root. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** This function makes a repository with a local identity, and without automatic maintenance. */
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
}

/** A script that writes the file `marker` when a program starts it. */
function markerScript(path: string, marker: string): void {
  writeFileSync(path, `#!/bin/sh\necho ran > "${marker.replaceAll("\\", "/")}"\n`);
  chmodSync(path, 0o755);
}

/** The refusal of a root: FORBIDDEN with the reason outside-root. Its message. */
async function refused(key: string, input: unknown): Promise<string> {
  const error = await call(key, input).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
  return (error as Error).message;
}

beforeAll(() => {
  for (const name of ENV) saved.set(name, process.env[name]);
  // The global and the system configurations of the machine do not apply to the setup
  const shared = mkdtempSync(join(tmpdir(), "git-host-root-config-"));
  writeFileSync(join(shared, "gitconfig"), "");
  process.env["GIT_CONFIG_GLOBAL"] = join(shared, "gitconfig");
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
  delete process.env["GIT_CEILING_DIRECTORIES"];
});

afterAll(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "git-host-root-"));
  root = join(base, "root");
  mkdirSync(join(root, "repo"), { recursive: true });
  rooted = createRegistry(gitModule);
  confineToRoot(rooted, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true, maxRetries: 5 });
});

describe("the git procedures under the root of a host", () => {
  it("are all confined, with the working folder and the pathspecs as their rules", () => {
    const kinds = new Set(gitModule.procedures.map((procedure) => rootDecisionOf(procedure).kind));
    expect([...kinds]).toEqual(["confined"]);
    const rules = Object.fromEntries(gitModule.procedures.map((procedure) => [procedure.path.join("."), procedure.metadata.fsRoot]));
    expect(rules["git.log"]).toEqual({ cwd: "cwd" });
    for (const key of ["git.status", "git.add", "git.commit", "git.checkout", "git.diff", "git.stash.push", "git.reset", "git.restore"]) {
      expect(rules[key], key).toEqual({ cwd: "cwd", names: ["paths"] });
    }
    expect(rules["git.blame"]).toEqual({ cwd: "cwd", names: ["path"] });
    expect(rules["git.clone"]).toEqual({ cwd: "cwd", names: ["dest"] });
    expect(rules["git.worktree.add"]).toEqual({ cwd: "cwd", names: ["path"] });
    expect(rules["git.worktree.remove"]).toEqual({ cwd: "cwd", names: ["path"] });
  });

  it("run in a working folder in the root, with the root as the default", async () => {
    const init = await call<GitInitOutput>("git.init", { cwd: "repo", initialBranch: "main" });
    expect(init).toEqual({ path: join(root, "repo"), created: true });
    for (const [key, value] of [
      ["user.name", "Test"],
      ["user.email", "test@example.com"],
      ["commit.gpgsign", "false"],
      ["maintenance.auto", "false"],
    ]) {
      git(join(root, "repo"), "config", key!, value!);
    }
    mkdirSync(join(root, "repo", "src"));
    writeFileSync(join(root, "repo", "src", "a.txt"), "one\n");
    // A working folder below the top of the repository finds the repository
    const status = await call<GitStatusOutput>("git.status", { cwd: "repo/src", untrackedFiles: "all" });
    expect(status.files).toEqual([{ path: "src/a.txt", status: "untracked", staged: false }]);
    await call("git.add", { cwd: "repo", paths: ["src/a.txt"] });
    const commit = await call<GitCommitOutput>("git.commit", { cwd: "repo", message: "first" });
    expect(commit.message).toBe("first");
    const log = await call<GitLogOutput>("git.log", { cwd: join(root, "repo") });
    expect(log.commits.map((entry) => entry.message)).toEqual(["first"]);
  });

  it("refuse a working folder or a pathspec outside the root, and start no git", async () => {
    initRepo(join(base, "outside"));
    for (const cwd of [base, join(base, "outside"), "../outside"]) {
      await refused("git.status", { cwd });
    }
    await refused("git.init", { cwd: join(base, "new") });
    expect(existsSync(join(base, "new"))).toBe(false);
    initRepo(join(root, "repo"));
    await refused("git.add", { cwd: "repo", paths: ["../../outside/a.txt"] });
    await refused("git.add", { cwd: "repo", paths: [join(base, "outside", "a.txt")] });
  });

  it("find no repository above the root, and set GIT_CEILING_DIRECTORIES to the parent of the root", async () => {
    // A repository that holds the root: without a root, git finds it from a folder in the root
    initRepo(base);
    expect((await call<GitStatusOutput>("git.status", { cwd: join(root, "repo") }, plain)).branch).toBe("main");
    await expect(call("git.status", { cwd: "repo" })).rejects.toThrow(/not a git repository/i);
    await expect(call("git.log", {})).rejects.toThrow(/not a git repository/i);

    const resolved = await resolveRoot(root);
    expect(ceilingOf(resolved).split(process.platform === "win32" ? ";" : ":")).toContain(dirname(root));
    const command = await underGitRoot(root, ["git", "status"], async () => confinedGitCommand(currentGitRoot()!, ["status"], undefined, undefined));
    expect(command.cwd).toBe(root);
    expect(command.env["GIT_CEILING_DIRECTORIES"]).toBe(ceilingOf(resolved));
    expect(command.env["GIT_CONFIG_NOSYSTEM"]).toBe("1");
    expect(command.env["GIT_DIR"]).toBeUndefined();
    expect("GIT_DIR" in command.env).toBe(true);
    expect(command.args).toEqual(expect.arrayContaining(["-c", "core.fsmonitor=false", "-c", "protocol.file.allow=never", "-c", "protocol.ext.allow=never"]));
    expect(command.args.at(-1)).toBe("status");
  });

  it("run no hook and no fsmonitor of the repository", async () => {
    const repo = join(root, "repo");
    initRepo(repo);
    const hookMarker = join(base, "hook-ran");
    markerScript(join(repo, ".git", "hooks", "pre-commit"), hookMarker);
    const monitorMarker = join(base, "fsmonitor-ran");
    markerScript(join(base, "fsmonitor.sh"), monitorMarker);
    writeFileSync(join(repo, "a.txt"), "one\n");
    git(repo, "add", "a.txt");

    await call<GitCommitOutput>("git.commit", { cwd: "repo", message: "under the root" });
    expect(existsSync(hookMarker)).toBe(false);
    // Without a root, the same hook runs
    writeFileSync(join(repo, "a.txt"), "two\n");
    await call<GitCommitOutput>("git.commit", { cwd: repo, message: "without a root", all: true }, plain);
    expect(existsSync(hookMarker)).toBe(true);

    git(repo, "config", "core.fsmonitor", join(base, "fsmonitor.sh").replaceAll("\\", "/"));
    writeFileSync(join(repo, "a.txt"), "three\n");
    expect((await call<GitStatusOutput>("git.status", { cwd: "repo" })).clean).toBe(false);
    expect(existsSync(monitorMarker)).toBe(false);
  });

  it("refuse a repository whose configuration starts a program, and name each key", async () => {
    const repo = join(root, "repo");
    initRepo(repo);
    const marker = join(base, "filter-ran");
    markerScript(join(base, "filter.sh"), marker);
    writeFileSync(join(repo, ".gitattributes"), "*.txt filter=x\n");
    writeFileSync(join(repo, "a.txt"), "one\n");
    git(repo, "config", "filter.x.clean", join(base, "filter.sh").replaceAll("\\", "/"));
    git(repo, "config", "include.path", "../../outside.gitconfig");
    git(repo, "config", "core.sshCommand", "ssh -o ProxyCommand=evil");
    git(repo, "config", "credential.helper", "!evil");
    const message = await refused("git.add", { cwd: "repo", all: true });
    for (const key of ["filter.x.clean", "include.path", "core.sshcommand", "credential.helper"]) expect(message).toContain(key);
    await refused("git.status", { cwd: "repo/" });
    expect(existsSync(marker)).toBe(false);
  });

  it("refuse a repository outside the root through a .git file, and a repository with submodules", async () => {
    initRepo(join(base, "outside"));
    mkdirSync(join(root, "linked"));
    writeFileSync(join(root, "linked", ".git"), `gitdir: ${join(base, "outside", ".git").replaceAll("\\", "/")}\n`);
    expect(await refused("git.status", { cwd: "linked" })).toContain("outside the root");

    const repo = join(root, "repo");
    initRepo(repo);
    writeFileSync(join(repo, ".gitmodules"), '[submodule "sub"]\n\tpath = sub\n\tignore = none\n');
    expect(await refused("git.status", { cwd: "repo" })).toContain("submodules");
  });

  it("refuse a clone from a local path, a clone out of the root, and a remote helper", async () => {
    const origin = join(base, "origin");
    initRepo(origin);
    git(origin, "commit", "-q", "--allow-empty", "-m", "first");
    // The transport file is off, also for a path in the root
    await expect(call("git.clone", { url: origin, dest: "copy" })).rejects.toThrow(/not allowed/);
    expect(existsSync(join(root, "copy"))).toBe(false);
    await refused("git.clone", { url: "https://example.invalid/repo.git", dest: "../copy" });
    await refused("git.clone", { url: "https://example.invalid/repo/.." });
    expect(await refused("git.clone", { url: "ext::sh -c touch% pwned", dest: "copy" })).toContain("::");

    initRepo(join(root, "repo"));
    expect(await refused("git.remote.set", { cwd: "repo", url: "ext::sh -c touch% pwned" })).toContain("::");
    // Without a root, the clone of a local path works
    await call("git.clone", { url: origin, dest: join(base, "copy") }, plain);
    expect(existsSync(join(base, "copy", ".git"))).toBe(true);
  });

  it("run without a root", async () => {
    const init = await call<GitInitOutput>("git.init", { cwd: join(root, "repo"), initialBranch: "main" }, plain);
    expect(init.created).toBe(true);
    expect(existsSync(join(root, "repo", ".git"))).toBe(true);
  });
});

describe("the configuration that a root refuses", () => {
  it("names the keys that start a program or name a file outside the repository", () => {
    for (const key of [
      "core.sshcommand",
      "core.pager",
      "core.editor",
      "core.askpass",
      "core.worktree",
      "core.excludesfile",
      "diff.external",
      "filter.lfs.clean",
      "filter.My.Driver.smudge",
      "filter.x.process",
      "diff.x.textconv",
      "diff.x.command",
      "merge.x.driver",
      "credential.helper",
      "credential.https://example.com.helper",
      "gpg.program",
      "gpg.ssh.program",
      "gpg.ssh.defaultkeycommand",
      "include.path",
      "includeif.gitdir:/x/.path",
      "pager.log",
      "hook.lint.command",
      "protocol.ext.allow",
      "bundle.x.uri",
      "remote.origin.uploadpack",
      "remote.origin.receivepack",
      "http.sslcert",
      "http.https://example.com.sslkey",
      "trailer.x.cmd",
    ]) {
      expect(isRefusedConfigKey(key, "value"), key).toBe(true);
    }
    expect(isRefusedConfigKey("commit.gpgsign", "true")).toBe(true);
    expect(isRefusedConfigKey("commit.gpgsign", undefined)).toBe(true);
    expect(isRefusedConfigKey("remote.origin.url", "ext::sh -c x")).toBe(true);
    expect(isRefusedConfigKey("url.ext::sh -c x.insteadof", "https://")).toBe(true);
    expect(isRefusedConfigKey("submodule.x.update", "!rm -rf /")).toBe(true);
  });

  it("keeps the keys that start no program", () => {
    for (const [key, value] of [
      ["core.repositoryformatversion", "0"],
      ["core.bare", "false"],
      ["core.autocrlf", "input"],
      ["core.fsmonitor", "true"],
      ["core.hookspath", ".husky"],
      ["user.name", "Test"],
      ["commit.gpgsign", "false"],
      ["remote.origin.url", "https://github.com/x/y.git"],
      ["remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"],
      ["branch.main.remote", "origin"],
      ["url.https://github.com/.insteadof", "gh:"],
      ["submodule.x.update", "checkout"],
      ["filter.x.required", "true"],
      ["diff.x.binary", "true"],
    ] as const) {
      expect(isRefusedConfigKey(key, value), key).toBe(false);
    }
  });

  it("reads the list of git config, and examines only the files of the repository", () => {
    const entries = parseConfigList("global\0core.pager\nless\0local\0core.bare\nfalse\0local\0filter.x.clean\ncat\0worktree\0include.path\0command\0core.editor\nvi\0");
    expect(entries).toEqual([
      { scope: "global", key: "core.pager", value: "less" },
      { scope: "local", key: "core.bare", value: "false" },
      { scope: "local", key: "filter.x.clean", value: "cat" },
      { scope: "worktree", key: "include.path", value: undefined },
      { scope: "command", key: "core.editor", value: "vi" },
    ]);
    expect(refusedConfigKeys(entries)).toEqual(["filter.x.clean", "include.path"]);
  });
});
