/**
 * E2E: commands of several client packages through the built CLI.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { built, json, mark } from "./run.js";

describe.skipIf(!built)("mark: commands of the client packages", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "mark-e2e-commands-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs a program with shell run, and fails with the program (CLI-8)", () => {
    const ok = mark(["--format", "json", "shell", "run", process.execPath, "--args=-e", "--args", "console.log('from e2e')"]);
    expect(ok.exitCode).toBe(0);
    expect(json<{ stdout: string }>(ok).stdout).toContain("from e2e");

    const failed = mark(["shell", "run", process.execPath, "--args=-e", "--args", "process.exit(3)"]);
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toContain("exit code 3");
  });

  it("writes, reads and finds a file with fs", () => {
    const file = join(dir, "note.txt");
    expect(mark(["fs", "write", file, "hello e2e"]).exitCode).toBe(0);
    expect(json<{ content: string }>(mark(["--format", "json", "fs", "read", file])).content).toBe("hello e2e");
    expect(json<{ exists: boolean }>(mark(["--format", "json", "fs", "exists", file])).exists).toBe(true);
  });

  it("makes a git repository, commits, and reads its status", () => {
    const repo = join(dir, "repo");
    // An author for the commit, also on a machine with no git configuration
    const identity = {
      GIT_AUTHOR_NAME: "e2e",
      GIT_AUTHOR_EMAIL: "e2e@example.invalid",
      GIT_COMMITTER_NAME: "e2e",
      GIT_COMMITTER_EMAIL: "e2e@example.invalid",
    };
    const ok = (args: string[], env?: Record<string, string>): void => {
      const run = mark(args, env ? { env } : {});
      expect(run.exitCode, `${args.join(" ")}\n${run.stdout}\n${run.stderr}`).toBe(0);
    };
    ok(["fs", "mkdir", repo]);
    ok(["git", "init", "--cwd", repo]);
    expect(existsSync(join(repo, ".git"))).toBe(true);
    ok(["fs", "write", join(repo, "a.txt"), "a"]);
    ok(["git", "add", "--all", "--cwd", repo]);
    ok(["git", "commit", "--message", "first", "--cwd", repo], identity);
    // git status needs a commit: on an empty repository it fails (reported as a client-git defect)
    ok(["git", "status", "--cwd", repo]);
  });

  it("lists and reads procedures", () => {
    const list = mark(["--format", "json", "procedure", "list", "--namespace", "fs"]);
    expect(list.exitCode).toBe(0);
    expect(list.stdout).toContain("read");

    const get = mark(["--format", "json", "procedure", "get", "fs.read"]);
    expect(get.exitCode).toBe(0);
    expect(get.stdout).toContain("fs");
  });
});
