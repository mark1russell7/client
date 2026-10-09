/**
 * The git procedures read git's output exactly (deep dive WRP-7): paths with spaces, renames,
 * and the `short` and `oneline` options. They also run git without blocking, and stop when the
 * signal of the call aborts (roadmap 2.2). Each test uses a temporary repository.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitDiff } from "./diff.js";
import { gitStatus } from "./status.js";
import { gitLog } from "./log.js";
import { gitStashPush, gitStashPop } from "./stash.js";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], {
    cwd,
    encoding: "utf8",
  });
}

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "client-git-parse-"));
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  writeFileSync(join(repo, "my file.txt"), "one\n");
  writeFileSync(join(repo, "a.txt"), "alpha\nbeta\ngamma\ndelta\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "first | with a bar");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("git.diff", () => {
  it("keeps a path that has spaces", async () => {
    writeFileSync(join(repo, "my file.txt"), "one\ntwo\n");
    const diff = await gitDiff({ cwd: repo, stat: true } as Parameters<typeof gitDiff>[0]);
    expect(diff.files).toEqual([{ path: "my file.txt", additions: 1, deletions: 0 }]);
    expect(diff.additions).toBe(1);
  });

  it("reports a rename with the old and the new path", async () => {
    git(repo, "mv", "a.txt", "b c.txt");
    const diff = await gitDiff({ cwd: repo, staged: true, stat: true } as Parameters<typeof gitDiff>[0]);
    expect(diff.files).toEqual([{ path: "b c.txt", from: "a.txt", additions: 0, deletions: 0 }]);
  });
});

describe("git.status", () => {
  it("reports a rename as from and to, and keeps paths with spaces", async () => {
    git(repo, "mv", "a.txt", "b.txt");
    writeFileSync(join(repo, "my file.txt"), "changed\n");
    writeFileSync(join(repo, "new file.txt"), "new\n");
    const status = await gitStatus({ cwd: repo } as Parameters<typeof gitStatus>[0]);
    expect(status.files).toEqual(
      expect.arrayContaining([
        { path: "b.txt", from: "a.txt", status: "renamed", staged: true },
        { path: "my file.txt", status: "modified", staged: false },
        { path: "new file.txt", status: "untracked", staged: false },
      ]),
    );
    expect(status.files.length).toBe(3);
  });

  it("gives the short format lines with short: true", async () => {
    git(repo, "mv", "a.txt", "b.txt");
    writeFileSync(join(repo, "new file.txt"), "new\n");
    const status = await gitStatus({ cwd: repo, short: true });
    expect(status.lines).toEqual(expect.arrayContaining(["R  a.txt -> b.txt", "?? new file.txt"]));
    const full = await gitStatus({ cwd: repo, short: false });
    expect(full.lines).toBeUndefined();
  });

  it("stops when the signal has aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(gitStatus({ cwd: repo, short: false }, { signal: controller.signal })).rejects.toThrow(/abort/i);
  });
});

describe("git.log", () => {
  it("keeps a message with a bar, and gives one line per commit with oneline: true", async () => {
    const log = await gitLog({ cwd: repo, count: 5, oneline: true });
    expect(log.commits[0]?.message).toBe("first | with a bar");
    expect(log.lines).toEqual([`${log.commits[0]?.shortHash} first | with a bar`]);
    const full = await gitLog({ cwd: repo, count: 5, oneline: false });
    expect(full.lines).toBeUndefined();
  });
});

describe("git.stash", () => {
  it("reports a conflict of git stash pop", async () => {
    writeFileSync(join(repo, "a.txt"), "alpha\nSTASHED\ngamma\ndelta\n");
    expect((await gitStashPush({ cwd: repo, message: "wip" } as Parameters<typeof gitStashPush>[0])).stashed).toBe(true);
    writeFileSync(join(repo, "a.txt"), "alpha\nCOMMITTED\ngamma\ndelta\n");
    git(repo, "commit", "-q", "-am", "second");
    const popped = await gitStashPop({ cwd: repo } as Parameters<typeof gitStashPop>[0]);
    expect(popped).toMatchObject({ applied: false, dropped: false, conflict: true });
  });
});
