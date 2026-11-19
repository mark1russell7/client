/**
 * The git procedures under a capability that does not permit `process` (tracker item O110). Git
 * starts no program of the repository: no hook, no `core.fsmonitor`, no remote helper. A
 * repository whose configuration starts a program, and a repository with submodules, get
 * `FORBIDDEN` with the reason `effects-exceeded`. A call without a capability runs as before. The
 * tests run the real `git` in temporary folders, without a root and without the network.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRegistry, invokePath, outputValue, type Capability } from "@procedures/client";
import { gitModule } from "./module.js";
import { gitLimitsOf, limitedGitCommand, type GitLimits } from "./procedures/git/limits.js";
import { parseConfigList, refusedConfigKeys, removeGitRootSetup, startsProgram } from "./procedures/git/root.js";
import type { GitStatusOutput } from "./types.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/** The capability of a read-only host: no write. */
const READ_ONLY: Capability = { effects: { writes: [] } };
/** A capability that writes files, but starts no program. */
const FILES_ONLY: Capability = { effects: { writes: ["fs"] } };

const registry = createRegistry(gitModule);
let base: string;
let repo: string;

/** The environment variables that the tests change, and restore after the tests. */
const ENV = ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_CEILING_DIRECTORIES"] as const;
const saved = new Map<string, string | undefined>();
/** The global configuration of the "host" of the tests. */
let hostConfig: string;

async function call<T>(key: string, input: unknown, capability?: Capability): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry, ...(capability === undefined ? {} : { capability }) }));
}

/** The refusal of a capability: FORBIDDEN with the reason effects-exceeded. Its message. */
async function refused(key: string, input: unknown, capability: Capability): Promise<string> {
  const error = await call(key, input, capability).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded" });
  return (error as Error).message;
}

/** This function runs git for the setup of a test, without limits. */
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

/** A script that writes the file `marker` when a program starts it. Its path, with forward slashes. */
function markerScript(path: string, marker: string): string {
  writeFileSync(path, `#!/bin/sh\necho ran > "${marker.replaceAll("\\", "/")}"\n`);
  chmodSync(path, 0o755);
  return path.replaceAll("\\", "/");
}

beforeAll(() => {
  for (const name of ENV) saved.set(name, process.env[name]);
  // The global and the system configurations of the machine do not apply to the tests
  const shared = mkdtempSync(join(tmpdir(), "git-limits-config-"));
  hostConfig = join(shared, "gitconfig");
  writeFileSync(hostConfig, "");
  process.env["GIT_CONFIG_GLOBAL"] = hostConfig;
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
  delete process.env["GIT_CEILING_DIRECTORIES"];
});

afterAll(() => {
  removeGitRootSetup();
  rmSync(dirname(hostConfig), { recursive: true, force: true });
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "git-limits-"));
  repo = join(base, "repo");
  initRepo(repo);
});

afterEach(() => {
  writeFileSync(hostConfig, "");
  rmSync(base, { recursive: true, force: true, maxRetries: 5 });
});

describe("the git procedures under a capability without process", () => {
  it("start no fsmonitor of the repository, and give the same status", async () => {
    const marker = join(base, "fsmonitor-ran");
    git(repo, "config", "core.fsmonitor", markerScript(join(base, "fsmonitor.sh"), marker));
    writeFileSync(join(repo, "a.txt"), "one\n");
    const status = await call<GitStatusOutput>("git.status", { cwd: repo, untrackedFiles: "all" }, READ_ONLY);
    expect(status.files).toEqual([{ path: "a.txt", status: "untracked", staged: false }]);
    expect(existsSync(marker)).toBe(false);
  });

  it("refuse a repository whose configuration starts a program, name the key and start no program", async () => {
    const marker = join(base, "filter-ran");
    const filter = markerScript(join(base, "filter.sh"), marker);
    writeFileSync(join(repo, ".gitattributes"), "*.txt filter=x\n");
    writeFileSync(join(repo, "a.txt"), "one\n");
    git(repo, "config", "filter.x.clean", filter);
    git(repo, "config", "diff.external", filter);

    const message = await refused("git.status", { cwd: repo }, READ_ONLY);
    expect(message).toContain("cannot start a program (process)");
    for (const key of ["filter.x.clean", "diff.external"]) expect(message).toContain(key);
    await refused("git.add", { cwd: repo, all: true }, FILES_ONLY);
    expect(existsSync(marker)).toBe(false);

    // Without a capability, the same filter runs
    git(repo, "config", "--unset", "diff.external");
    await call("git.add", { cwd: repo, all: true });
    expect(existsSync(marker)).toBe(true);
  });

  it("refuse a program in a file that the configuration of the repository includes", async () => {
    const included = join(base, "included.gitconfig");
    writeFileSync(included, `[filter "y"]\n\tclean = ${markerScript(join(base, "filter.sh"), join(base, "filter-ran"))}\n`);
    git(repo, "config", "include.path", included.replaceAll("\\", "/"));
    expect(await refused("git.status", { cwd: repo }, READ_ONLY)).toContain("filter.y.clean");
  });

  it("accept a program of the host configuration: it is a program of the host", async () => {
    const marker = join(base, "host-filter-ran");
    writeFileSync(hostConfig, `[filter "h"]\n\tclean = ${markerScript(join(base, "filter.sh"), marker)}\n`);
    writeFileSync(join(repo, ".gitattributes"), "*.txt filter=h\n");
    writeFileSync(join(repo, "a.txt"), "one\n");
    await call("git.add", { cwd: repo, all: true }, FILES_ONLY);
    expect(existsSync(marker)).toBe(true);
  });

  it("start no hook, also the reference-transaction hook of a new branch", async () => {
    const marker = join(base, "hook-ran");
    markerScript(join(repo, ".git", "hooks", "reference-transaction"), marker);
    git(repo, "commit", "-q", "--allow-empty", "--no-verify", "-m", "first");
    rmSync(marker, { force: true });

    await call("git.branch.add", { cwd: repo, name: "limited" }, FILES_ONLY);
    expect(git(repo, "branch", "--list", "limited").trim()).toContain("limited");
    expect(existsSync(marker)).toBe(false);
    // Without a capability, the same hook runs
    await call("git.branch.add", { cwd: repo, name: "plain" });
    expect(existsSync(marker)).toBe(true);
  });

  it("refuse a procedure that declares process, before git starts", async () => {
    const marker = join(base, "hook-ran");
    markerScript(join(repo, ".git", "hooks", "pre-commit"), marker);
    expect(await refused("git.commit", { cwd: repo, message: "limited" }, FILES_ONLY)).toContain("process");
    expect(existsSync(marker)).toBe(false);
  });

  it("refuse a repository with submodules", async () => {
    writeFileSync(join(repo, ".gitmodules"), '[submodule "sub"]\n\tpath = sub\n\tignore = none\n');
    expect(await refused("git.status", { cwd: repo }, READ_ONLY)).toContain("submodules");
    // A .gitmodules file in the index only
    const other = join(base, "other");
    initRepo(other);
    writeFileSync(join(other, ".gitmodules"), '[submodule "sub"]\n\tpath = sub\n');
    git(other, "add", ".gitmodules");
    rmSync(join(other, ".gitmodules"));
    expect(await refused("git.status", { cwd: other }, READ_ONLY)).toContain("submodules");
  });

  it("refuse a remote URL that starts a remote helper", async () => {
    expect(await refused("git.remote.set", { cwd: repo, url: "ext::sh -c touch% pwned" }, FILES_ONLY)).toContain("::");
    expect(await refused("git.clone", { url: "ext::sh -c touch% pwned", dest: join(base, "copy") }, FILES_ONLY)).toContain("::");
    expect(existsSync(join(base, "copy"))).toBe(false);
    // A plain URL passes
    await call("git.remote.set", { cwd: repo, url: "https://example.invalid/repo.git" }, FILES_ONLY);
    expect(git(repo, "remote", "get-url", "origin").trim()).toBe("https://example.invalid/repo.git");
  });

  it("pass a folder outside a repository to git", async () => {
    const empty = join(base, "empty");
    mkdirSync(empty);
    const current: GitLimits = { noProgram: true, noLazyFetch: true, procedure: ["git", "init"], examined: new Map() };
    const command = await limitedGitCommand(current, { args: ["init"], cwd: empty, env: undefined }, false);
    expect(command.args.slice(-1)).toEqual(["init"]);
    expect(command.env).toEqual({ GIT_NO_LAZY_FETCH: "1" });
  });
});

describe("the limits of a capability", () => {
  it("follow the permitted effects", () => {
    expect(gitLimitsOf(undefined)).toEqual({ noProgram: false, noLazyFetch: false });
    expect(gitLimitsOf({})).toEqual({ noProgram: false, noLazyFetch: false });
    expect(gitLimitsOf(READ_ONLY)).toEqual({ noProgram: true, noLazyFetch: true });
    expect(gitLimitsOf(FILES_ONLY)).toEqual({ noProgram: true, noLazyFetch: false });
    expect(gitLimitsOf({ effects: { writes: ["fs", "process"] } })).toEqual({ noProgram: false, noLazyFetch: false });
    expect(gitLimitsOf({ effects: { reads: ["fs"], writes: ["fs", "process"] } })).toEqual({ noProgram: false, noLazyFetch: true });
    expect(gitLimitsOf({ effects: { reads: "any", writes: "any" } })).toEqual({ noProgram: false, noLazyFetch: false });
  });

  it("turn off the lazy fetch, and examine each folder one time", async () => {
    const limits = (noProgram: boolean, noLazyFetch: boolean): GitLimits => ({ noProgram, noLazyFetch, procedure: ["git", "status"], examined: new Map() });
    const command = { args: ["status"], cwd: repo, env: { KEEP: "1" } };

    expect(await limitedGitCommand(limits(false, true), command, false)).toEqual({ ...command, env: { KEEP: "1", GIT_NO_LAZY_FETCH: "1" } });
    expect(await limitedGitCommand(limits(false, false), command, false)).toEqual(command);
    // Under a root, the root examined the repository and gave its options
    expect(await limitedGitCommand(limits(true, false), command, true)).toEqual(command);

    const current = limits(true, false);
    const first = await limitedGitCommand(current, command, false);
    expect(first.args.slice(-1)).toEqual(["status"]);
    expect(first.args).toEqual(expect.arrayContaining(["-c", "core.fsmonitor=false", "-c", "protocol.ext.allow=never"]));
    expect(first.args.some((arg) => arg.startsWith("core.hooksPath="))).toBe(true);
    await limitedGitCommand(current, { ...command, args: ["log"] }, false);
    expect([...current.examined.keys()]).toEqual([resolve(repo)]);
  });

  it("refuse only the keys that start a program", () => {
    for (const [key, value] of [
      ["filter.x.clean", "cat"],
      ["diff.external", "x"],
      ["diff.x.textconv", "x"],
      ["core.sshcommand", "ssh"],
      ["credential.helper", "store"],
      ["pager.log", "less"],
      ["hook.x.command", "x"],
      ["protocol.foo.allow", "always"],
      ["commit.gpgsign", "true"],
      ["remote.origin.url", "ext::sh -c x"],
      ["url.ext::sh -c x.insteadof", "https://"],
      ["submodule.a.update", "!sh"],
    ] as const) {
      expect(startsProgram(key, value), key).toBe(true);
    }
    for (const [key, value] of [
      // The option core.fsmonitor=false of each command turns it off
      ["core.fsmonitor", "/x.sh"],
      ["commit.gpgsign", "false"],
      ["remote.origin.url", "https://example.invalid/repo.git"],
      ["submodule.a.update", "rebase"],
      // A file outside the repository is a rule of a root, not of a capability
      ["include.path", "../x"],
      ["core.worktree", "/x"],
      ["user.name", "Test"],
    ] as const) {
      expect(startsProgram(key, value), key).toBe(false);
    }
  });

  it("skip the configuration of the host", () => {
    const entries = parseConfigList("global\0filter.g.clean\ncat\0local\0filter.l.clean\ncat\0local\0include.path\n../x\0command\0core.editor\nvi\0");
    expect(refusedConfigKeys(entries, startsProgram)).toEqual(["filter.l.clean"]);
  });
});
