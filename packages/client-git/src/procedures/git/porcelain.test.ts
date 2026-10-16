/**
 * The parser of `git status --porcelain=v1 -z`: the status letters, exact paths, renames and
 * copies with their old path, conflicts, and the branch line. The last test reads the output of
 * the real git in a temporary repository.
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyStatus, parsePorcelainV1 } from "./porcelain.js";
import { git as runGit } from "./run.js";

describe("parsePorcelainV1", () => {
  it("reads each entry with its status letters and its exact path", () => {
    const output = [" M a file.txt", "M  staged.txt", "MM both.txt", "A  new.txt", " D gone.txt", "?? notes/day one.md", "!! build/out.js", ""].join("\0");
    expect(parsePorcelainV1(output)).toEqual([
      { xy: " M", path: "a file.txt", status: "modified", staged: false },
      { xy: "M ", path: "staged.txt", status: "modified", staged: true },
      { xy: "MM", path: "both.txt", status: "modified", staged: true },
      { xy: "A ", path: "new.txt", status: "added", staged: true },
      { xy: " D", path: "gone.txt", status: "deleted", staged: false },
      { xy: "??", path: "notes/day one.md", status: "untracked", staged: false },
      { xy: "!!", path: "build/out.js", status: "ignored", staged: false },
    ]);
  });

  it("takes the old path of a rename or a copy from the next field", () => {
    const output = ["R  new name.txt", "old name.txt", "C  copy.txt", "source.txt", " R moved.txt", "was.txt", "?? after.txt", ""].join("\0");
    expect(parsePorcelainV1(output)).toEqual([
      { xy: "R ", path: "new name.txt", from: "old name.txt", status: "renamed", staged: true },
      { xy: "C ", path: "copy.txt", from: "source.txt", status: "copied", staged: true },
      { xy: " R", path: "moved.txt", from: "was.txt", status: "renamed", staged: false },
      { xy: "??", path: "after.txt", status: "untracked", staged: false },
    ]);
  });

  it("reads a conflict as a change that is not staged, and skips the branch line", () => {
    const output = ["## main...origin/main [ahead 1]", "UU both.txt", "AA added.txt", "DU deleted.txt", ""].join("\0");
    expect(parsePorcelainV1(output).map((entry) => [entry.xy, entry.path, entry.status, entry.staged])).toEqual([
      ["UU", "both.txt", "modified", false],
      ["AA", "added.txt", "modified", false],
      ["DU", "deleted.txt", "modified", false],
    ]);
  });

  it("gives no entries for an empty output", () => {
    expect(parsePorcelainV1("")).toEqual([]);
    expect(classifyStatus(".M")).toEqual({ status: "modified", staged: false });
  });

  it("reads the output of git", async () => {
    const repo = mkdtempSync(join(tmpdir(), "client-git-porcelain-"));
    try {
      const run = (...args: string[]): string => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
      run("init", "-q");
      run("config", "user.email", "test@example.com");
      run("config", "user.name", "Test");
      run("config", "core.autocrlf", "false");
      writeFileSync(join(repo, "a.txt"), "a\n");
      run("add", ".");
      run("-c", "commit.gpgsign=false", "commit", "-q", "-m", "first");
      run("mv", "a.txt", "b c.txt");
      mkdirSync(join(repo, "ledger", "2026"), { recursive: true });
      writeFileSync(join(repo, "ledger", "2026", "x.ndjson"), "{}\n");
      const output = await runGit(["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: repo });
      expect(parsePorcelainV1(output)).toEqual([
        { xy: "R ", path: "b c.txt", from: "a.txt", status: "renamed", staged: true },
        { xy: "??", path: "ledger/2026/x.ndjson", status: "untracked", staged: false },
      ]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
