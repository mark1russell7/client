/**
 * The git procedures pass user values to git as arguments (no shell). These tests check that a
 * value cannot become a git option, and that normal calls still work, in a temporary repository.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitArg } from "./args.js";
import { gitDiff } from "./diff.js";
import { gitLog } from "./log.js";
import { gitClone } from "./clone.js";
import { gitCheckout } from "./checkout.js";
import { gitBranch } from "./branch.js";
import { gitFetch } from "./fetch.js";
import { gitRemote } from "./remote.js";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("gitArg", () => {
  it("accepts refs, names and URLs", () => {
    expect(gitArg("ref", "HEAD~1")).toBe("HEAD~1");
    expect(gitArg("ref", "feature/x")).toBe("feature/x");
    expect(gitArg("url", "git@github.com:a/b.git")).toBe("git@github.com:a/b.git");
  });

  it("rejects values that git would read as options", () => {
    expect(() => gitArg("ref", "--output=x")).toThrow('Invalid ref (must not start with "-")');
    expect(() => gitArg("url", "-u")).toThrow("Invalid url");
  });
});

describe("git procedures with hostile values", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "client-git-"));
    git(repo, "init", "-q");
    writeFileSync(join(repo, "a.txt"), "one\n");
    git(repo, "add", "a.txt");
    git(repo, "commit", "-q", "-m", "first");
    writeFileSync(join(repo, "a.txt"), "two\n");
    git(repo, "commit", "-q", "-am", "second");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("still diffs and logs with a normal ref", async () => {
    const diff = await gitDiff({ cwd: repo, ref: "HEAD~1", stat: true });
    expect(diff.files.map((f) => f.path)).toEqual(["a.txt"]);

    const log = await gitLog({ cwd: repo, ref: "HEAD", count: 5 } as Parameters<typeof gitLog>[0]);
    expect(log.commits.length).toBe(2);
  });

  it("git.branch tells a local branch with a slash from a remote branch", async () => {
    git(repo, "branch", "feature/x");
    git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");

    const { branches } = await gitBranch({ cwd: repo, remote: true } as Parameters<typeof gitBranch>[0]);
    const byName = Object.fromEntries(branches.map((b) => [b.name, b.remote]));

    expect(byName["feature/x"]).toBe(false);
    expect(byName["origin/main"]).toBe(true);
  });

  it("git.diff: a ref cannot write a file with --output", async () => {
    const target = join(repo, "written-by-diff.txt");
    await expect(gitDiff({ cwd: repo, ref: `--output=${target}`, stat: true })).rejects.toThrow("Invalid ref");
    expect(existsSync(target)).toBe(false);
  });

  it("git.clone: a URL cannot run a command with --upload-pack", async () => {
    const marker = join(repo, "ran-upload-pack");
    await expect(
      gitClone({ cwd: repo, url: `--upload-pack=node -e "require('fs').writeFileSync('${marker.replace(/\\/g, "/")}', '')"` })
    ).rejects.toThrow("Invalid url");
    expect(existsSync(marker)).toBe(false);
  });

  it("git.fetch, git.checkout, git.branch and git.remote reject option-like values", async () => {
    await expect(gitFetch({ cwd: repo, remote: "--upload-pack=x" })).rejects.toThrow("Invalid remote");
    await expect(gitCheckout({ cwd: repo, ref: "--orphan=x" } as Parameters<typeof gitCheckout>[0])).rejects.toThrow("Invalid ref");
    await expect(gitBranch({ cwd: repo, name: "-D" } as Parameters<typeof gitBranch>[0])).rejects.toThrow("Invalid name");
    await expect(gitRemote({ cwd: repo, name: "origin", url: "--mirror" } as Parameters<typeof gitRemote>[0])).rejects.toThrow("Invalid url");
  });
});
