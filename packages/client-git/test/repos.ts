/**
 * The temporary repositories of the git tests (roadmap R33).
 *
 * `useRepos()` adds the hooks of a test file. Before the tests, it makes a template: a
 * repository `repo` with one commit, pushed to a bare `origin` on the disk. Before each test, it
 * copies the template into a new temporary folder, so push, pull, fetch and clone need no
 * network. Each repository sets `user.name` and `user.email` locally. The global and the system
 * configurations of the machine are not read, so their hooks, signing and line endings have no
 * effect.
 */

import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedurePath } from "@procedures/client";
import { gitModule } from "../src/module.js";

/** The registry of the git module only, as `createRegistry(gitModule)` gives it to a host. */
const registry = createRegistry(gitModule);

/** This function starts a procedure of the registry, with the validation of its input and output. */
export async function call<T>(path: ProcedurePath, input: unknown): Promise<T> {
  return outputValue(await invokePath<T>(path, input, { registry }), path);
}

/** This function runs git for the setup of a test (not a procedure under test). */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** This function makes a repository with its local identity and settings. */
export function initRepo(path: string, ...options: string[]): void {
  mkdirSync(path, { recursive: true });
  git(path, "init", "-q", "--initial-branch=main", ...options);
  git(path, "config", "user.name", "Test");
  git(path, "config", "user.email", "test@example.com");
  git(path, "config", "core.autocrlf", "false");
  git(path, "config", "commit.gpgsign", "false");
}

/** The folders of the current test. */
export interface Repos {
  /** The folder of the file: the configuration and the template. */
  readonly shared: string;
  /** The folder of the test, with `repo` and `origin.git` in it. */
  readonly base: string;
  readonly repo: string;
  readonly origin: string;
  /** This function makes a copy of `folder` (in `shared`) the folder of the test. */
  useCopyOf(folder: string): void;
  /** This function clones origin into `base/other`, with its local identity. */
  otherClone(): string;
}

/** The environment variables that the hooks change, and restore after the tests. */
const ENV = ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_CEILING_DIRECTORIES"] as const;

/** This function adds the hooks of the temporary repositories to a test file. */
export function useRepos(): Repos {
  // Each git command starts a process: on Windows a test takes some seconds
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
  const savedEnv = new Map<string, string | undefined>();
  let shared = "";
  let base = "";

  const repos: Repos = {
    get shared() {
      return shared;
    },
    get base() {
      return base;
    },
    get repo() {
      return join(base, "repo");
    },
    get origin() {
      return join(base, "origin.git");
    },
    useCopyOf(folder: string): void {
      rmSync(base, { recursive: true, force: true });
      cpSync(folder, base, { recursive: true });
      git(repos.repo, "remote", "set-url", "origin", repos.origin);
    },
    otherClone(): string {
      const other = join(base, "other");
      git(base, "clone", "-q", repos.origin, other);
      git(other, "config", "user.name", "Other");
      git(other, "config", "user.email", "other@example.com");
      git(other, "config", "core.autocrlf", "false");
      return other;
    },
  };

  beforeAll(() => {
    for (const name of ENV) savedEnv.set(name, process.env[name]);
    shared = mkdtempSync(join(tmpdir(), "client-git-shared-"));
    // A global configuration of the tests: no hooks path, no signing, no autocrlf of the machine.
    // Automatic maintenance is off: after a push or a commit, git starts `git maintenance run
    // --auto --detach` in the background. That process could change origin.git/objects while
    // useCopyOf() copies the template, and the copy failed with ENOENT (CI run 39079695949).
    writeFileSync(join(shared, "gitconfig"), ["[maintenance]", "auto = false", "[gc]", "auto = 0", "autoDetach = false", ""].join("\n"));
    process.env["GIT_CONFIG_GLOBAL"] = join(shared, "gitconfig");
    process.env["GIT_CONFIG_NOSYSTEM"] = "1";
    // A folder in the temporary folder is never in a repository of an ancestor
    process.env["GIT_CEILING_DIRECTORIES"] = tmpdir();
    const template = join(shared, "template");
    initRepo(join(template, "origin.git"), "--bare");
    initRepo(join(template, "repo"));
    writeFileSync(join(template, "repo", "a.txt"), "one\n");
    git(join(template, "repo"), "add", "a.txt");
    git(join(template, "repo"), "commit", "-q", "-m", "first");
    git(join(template, "repo"), "remote", "add", "origin", join(template, "origin.git"));
    git(join(template, "repo"), "push", "-q", "-u", "origin", "main");
  });

  afterAll(() => {
    for (const [name, value] of savedEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(shared, { recursive: true, force: true });
  });

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "client-git-test-"));
    repos.useCopyOf(join(shared, "template"));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  return repos;
}
