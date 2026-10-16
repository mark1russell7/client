/**
 * Each git procedure through a registry of `gitModule` (roadmap R33): the happy path and the
 * main errors. The tests run the real `git` in the temporary repositories of `test/repos.ts`.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { call, git, useRepos } from "../test/repos.js";
import type {
  GitAddOutput,
  GitBranchOutput,
  GitCheckoutOutput,
  GitCloneOutput,
  GitCommitOutput,
  GitDiffOutput,
  GitFetchOutput,
  GitInitOutput,
  GitLogOutput,
  GitPredicateOutput,
  GitPullOutput,
  GitPushOutput,
  GitRemoteOutput,
  GitStashApplyOutput,
  GitStashDropOutput,
  GitStashExportOutput,
  GitStashImportOutput,
  GitStashListOutput,
  GitStashPopOutput,
  GitStashPushOutput,
  GitStatusOutput,
} from "./types.js";

const repos = useRepos();
let base: string;
let repo: string;
let origin: string;

beforeEach(() => {
  ({ base, repo, origin } = repos);
});

/** A clone of origin with its local identity: the other side of a push and a pull. */
function otherClone(): string {
  return repos.otherClone();
}

describe("git.status", () => {
  it("gives the branch and a clean state, then the changed files", async () => {
    expect(await call<GitStatusOutput>(["git", "status"], { cwd: repo })).toMatchObject({ branch: "main", ahead: 0, behind: 0, files: [], clean: true });
    writeFileSync(join(repo, "a.txt"), "two\n");
    writeFileSync(join(repo, "new.txt"), "new\n");
    const status = await call<GitStatusOutput>(["git", "status"], { cwd: repo });
    expect(status.clean).toBe(false);
    expect(status.files).toEqual(
      expect.arrayContaining([
        { path: "a.txt", status: "modified", staged: false },
        { path: "new.txt", status: "untracked", staged: false },
      ]),
    );
  });

  it("counts the commits ahead of the upstream", async () => {
    writeFileSync(join(repo, "a.txt"), "two\n");
    git(repo, "commit", "-q", "-am", "second");
    expect((await call<GitStatusOutput>(["git", "status"], { cwd: repo })).ahead).toBe(1);
  });

  it("fails outside a repository, and validates its input", async () => {
    const empty = join(base, "empty");
    mkdirSync(empty);
    await expect(call(["git", "status"], { cwd: empty })).rejects.toThrow(/not a git repository/i);
    await expect(call(["git", "status"], { cwd: 5 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("git.add", () => {
  it("stages the given paths, and gives the staged paths", async () => {
    writeFileSync(join(repo, "b c.txt"), "b\n");
    writeFileSync(join(repo, "d.txt"), "d\n");
    expect(await call<GitAddOutput>(["git", "add"], { cwd: repo, paths: ["b c.txt"] })).toEqual({ staged: ["b c.txt"] });
  });

  it("stages each change with all, deletions too", async () => {
    rmSync(join(repo, "a.txt"));
    writeFileSync(join(repo, "d.txt"), "d\n");
    const result = await call<GitAddOutput>(["git", "add"], { cwd: repo, all: true });
    expect(result.staged.sort()).toEqual(["a.txt", "d.txt"]);
  });

  it("passes a path that starts with - as a path, after --", async () => {
    await expect(call(["git", "add"], { cwd: repo, paths: ["--dry-run"] })).rejects.toThrow(/did not match any files/);
    writeFileSync(join(repo, "-n"), "dash\n");
    expect(await call<GitAddOutput>(["git", "add"], { cwd: repo, paths: ["-n"] })).toEqual({ staged: ["-n"] });
  });
});

describe("git.commit", () => {
  it("commits the staged changes, and gives the hash and the message", async () => {
    writeFileSync(join(repo, "a.txt"), "two\n");
    git(repo, "add", "a.txt");
    const commit = await call<GitCommitOutput>(["git", "commit"], { cwd: repo, message: "second" });
    expect(commit.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(commit).toMatchObject({ message: "second", author: "Test" });
    expect(git(repo, "rev-parse", "HEAD").trim()).toBe(commit.hash);
  });

  it("commits the changes of the tracked files with all, and replaces the last commit with amend", async () => {
    writeFileSync(join(repo, "a.txt"), "two\n");
    const commit = await call<GitCommitOutput>(["git", "commit"], { cwd: repo, message: "second", all: true });
    const amended = await call<GitCommitOutput>(["git", "commit"], { cwd: repo, message: "second, amended", amend: true });
    expect(amended.hash).not.toBe(commit.hash);
    expect(git(repo, "rev-list", "--count", "HEAD").trim()).toBe("2");
    expect(git(repo, "log", "-1", "--format=%s").trim()).toBe("second, amended");
  });

  it("skips when there is nothing to commit", async () => {
    expect(await call<GitCommitOutput>(["git", "commit"], { cwd: repo, message: "empty" })).toMatchObject({ skipped: true });
  });

  it("skips when nothing is staged, also with untracked files and unstaged changes", async () => {
    writeFileSync(join(repo, "untracked.txt"), "u\n");
    expect(await call<GitCommitOutput>(["git", "commit"], { cwd: repo, message: "x" })).toMatchObject({ skipped: true });
    // With all, an untracked file is still not a change to commit
    expect(await call<GitCommitOutput>(["git", "commit"], { cwd: repo, message: "x", all: true })).toMatchObject({ skipped: true });
    writeFileSync(join(repo, "a.txt"), "changed\n");
    expect(await call<GitCommitOutput>(["git", "commit"], { cwd: repo, message: "x" })).toMatchObject({ skipped: true });
    expect(git(repo, "rev-list", "--count", "HEAD").trim()).toBe("1");
    // The same change with all is a commit
    expect((await call<GitCommitOutput>(["git", "commit"], { cwd: repo, message: "x", all: true })).skipped).toBeUndefined();
  });

  it("starts the hooks of the repository (so it declares that it writes process)", async () => {
    const hook = join(repo, ".git", "hooks", "post-commit");
    writeFileSync(hook, "#!/bin/sh\necho ran > hook-ran.txt\n");
    chmodSync(hook, 0o755);
    writeFileSync(join(repo, "a.txt"), "two\n");
    await call(["git", "commit"], { cwd: repo, message: "with hook", all: true });
    expect(readFileSync(join(repo, "hook-ran.txt"), "utf8").trim()).toBe("ran");
  });

  it("refuses an input without a message", async () => {
    await expect(call(["git", "commit"], { cwd: repo })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("git.log", () => {
  it("gives the commits, the newest first, and limits them with count", async () => {
    writeFileSync(join(repo, "a.txt"), "two\n");
    git(repo, "commit", "-q", "-am", "second");
    const log = await call<GitLogOutput>(["git", "log"], { cwd: repo });
    expect(log.commits.map((commit) => commit.message)).toEqual(["second", "first"]);
    expect(log.commits[0]).toMatchObject({ author: "Test", email: "test@example.com" });
    expect((await call<GitLogOutput>(["git", "log"], { cwd: repo, count: 1 })).commits).toHaveLength(1);
  });

  it("fails for an unknown ref", async () => {
    await expect(call(["git", "log"], { cwd: repo, ref: "no-such-ref" })).rejects.toThrow(/no-such-ref/);
  });
});

describe("git.diff", () => {
  it("gives the counts, and the full diff without stat", async () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    const diff = await call<GitDiffOutput>(["git", "diff"], { cwd: repo });
    expect(diff).toMatchObject({ files: [{ path: "a.txt", additions: 1, deletions: 0 }], additions: 1, deletions: 0 });
    expect(diff.diff).toContain("+two");
    expect((await call<GitDiffOutput>(["git", "diff"], { cwd: repo, staged: true })).files).toEqual([]);
  });

  it("limits the diff to the given paths", async () => {
    writeFileSync(join(repo, "a.txt"), "changed\n");
    writeFileSync(join(repo, "b.txt"), "b\n");
    git(repo, "add", "b.txt");
    const diff = await call<GitDiffOutput>(["git", "diff"], { cwd: repo, staged: true, paths: ["a.txt"], stat: true });
    expect(diff.files).toEqual([]);
    expect(diff.diff).toBeUndefined();
  });
});

describe("git.branch", () => {
  it("creates, lists and deletes a branch", async () => {
    expect(await call<GitBranchOutput>(["git", "branch"], { cwd: repo, name: "feature" })).toEqual({ created: "feature", current: "main" });
    const list = await call<GitBranchOutput>(["git", "branch"], { cwd: repo });
    expect(list.current).toBe("main");
    expect(list.branches?.map((branch) => branch.name).sort()).toEqual(["feature", "main"]);
    expect(list.branches?.find((branch) => branch.name === "main")).toMatchObject({ current: true, tracking: "origin/main" });
    expect(await call<GitBranchOutput>(["git", "branch"], { cwd: repo, name: "feature", delete: true })).toEqual({ deleted: "feature", current: "main" });
    expect(git(repo, "branch", "--list", "feature").trim()).toBe("");
  });

  it("fails for a branch that exists, and for the deletion of a missing branch", async () => {
    await expect(call(["git", "branch"], { cwd: repo, name: "main" })).rejects.toThrow(/already exists/);
    await expect(call(["git", "branch"], { cwd: repo, name: "missing", delete: true })).rejects.toThrow(/not found/);
  });
});

describe("git.checkout", () => {
  it("creates and checks out a branch, then restores a file", async () => {
    expect(await call<GitCheckoutOutput>(["git", "checkout"], { cwd: repo, ref: "topic", create: true })).toEqual({ ref: "topic", created: true });
    expect(git(repo, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("topic");
    writeFileSync(join(repo, "a.txt"), "changed\n");
    await call(["git", "checkout"], { cwd: repo, ref: "HEAD", paths: ["a.txt"] });
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("one\n");
  });

  it("fails for an unknown ref", async () => {
    await expect(call(["git", "checkout"], { cwd: repo, ref: "no-such-branch" })).rejects.toThrow(/no-such-branch/);
  });
});

describe("git.init", () => {
  it("makes a repository, and gives created: false for an existing one", async () => {
    const fresh = join(base, "fresh");
    mkdirSync(fresh);
    expect(await call<GitInitOutput>(["git", "init"], { cwd: fresh, initialBranch: "trunk" })).toEqual({ path: fresh, created: true });
    expect(readFileSync(join(fresh, ".git", "HEAD"), "utf8").trim()).toBe("ref: refs/heads/trunk");
    expect(await call<GitInitOutput>(["git", "init"], { cwd: fresh })).toEqual({ path: fresh, created: false });
    expect(await call<GitInitOutput>(["git", "init"], { cwd: repo })).toMatchObject({ created: false });
  });

  it("fails for a folder that does not exist", async () => {
    await expect(call(["git", "init"], { cwd: join(base, "missing") })).rejects.toThrow();
  });
});

describe("git.remote and git.remote.set", () => {
  it("reads the URL of a remote, sets it, and adds a missing remote", async () => {
    expect(await call<GitRemoteOutput>(["git", "remote"], { cwd: repo })).toEqual({ name: "origin", url: origin });
    expect(await call<GitRemoteOutput>(["git", "remote", "set"], { cwd: repo, name: "backup", url: "https://example.com/b.git" })).toEqual({
      name: "backup",
      url: "https://example.com/b.git",
    });
    await call(["git", "remote", "set"], { cwd: repo, name: "backup", url: "https://example.com/c.git" });
    expect(git(repo, "remote", "get-url", "backup").trim()).toBe("https://example.com/c.git");
  });

  it("fails for a missing remote", async () => {
    await expect(call(["git", "remote"], { cwd: repo, name: "missing" })).rejects.toThrow(/No such remote/i);
  });
});

describe("git.push, git.fetch and git.pull", () => {
  it("pushes the commits of the branch, and counts them", async () => {
    writeFileSync(join(repo, "a.txt"), "two\n");
    git(repo, "commit", "-q", "-am", "second");
    expect(await call<GitPushOutput>(["git", "push"], { cwd: repo })).toEqual({ remote: "origin", branch: "main", commits: 1 });
    expect(git(origin, "rev-parse", "main").trim()).toBe(git(repo, "rev-parse", "HEAD").trim());
  });

  it("pushes a new branch with setUpstream", async () => {
    git(repo, "checkout", "-q", "-b", "topic");
    expect(await call<GitPushOutput>(["git", "push"], { cwd: repo, setUpstream: true })).toMatchObject({ branch: "topic", commits: 1 });
    expect(git(repo, "rev-parse", "--abbrev-ref", "topic@{upstream}").trim()).toBe("origin/topic");
  });

  it("fails to push to a missing remote", async () => {
    await expect(call(["git", "push"], { cwd: repo, remote: "nowhere" })).rejects.toThrow(/nowhere/);
  });

  it("fetches and pulls the commits of another clone", async () => {
    const other = otherClone();
    writeFileSync(join(other, "a.txt"), "from other\n");
    git(other, "commit", "-q", "-am", "from other");
    git(other, "push", "-q", "origin", "main");

    expect(await call<GitFetchOutput>(["git", "fetch"], { cwd: repo })).toEqual({ remote: "origin", fetched: true });
    expect((await call<GitStatusOutput>(["git", "status"], { cwd: repo })).behind).toBe(1);
    expect(await call<GitPullOutput>(["git", "pull"], { cwd: repo })).toEqual({ remote: "origin", branch: "main", commits: 1, fastForward: true });
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("from other\n");
  });

  it("fails to fetch or pull from a missing remote", async () => {
    await expect(call(["git", "fetch"], { cwd: repo, remote: "nowhere" })).rejects.toThrow(/nowhere/);
    await expect(call(["git", "pull"], { cwd: repo, remote: "nowhere" })).rejects.toThrow(/nowhere/);
  });
});

describe("git.clone", () => {
  it("clones into a new folder, and gives its path and branch", async () => {
    const result = await call<GitCloneOutput>(["git", "clone"], { cwd: base, url: origin, dest: "copy" });
    expect(result).toEqual({ path: join(base, "copy"), branch: "main" });
    expect(readFileSync(join(base, "copy", "a.txt"), "utf8")).toBe("one\n");
  });

  it("fails for a folder that is not empty, and for a missing source", async () => {
    await expect(call(["git", "clone"], { cwd: base, url: origin, dest: "repo" })).rejects.toThrow(/already exists/);
    await expect(call(["git", "clone"], { cwd: base, url: join(base, "missing.git"), dest: "x" })).rejects.toThrow();
    expect(existsSync(join(base, "x"))).toBe(false);
  });
});

describe("the predicates", () => {
  async function value(name: string, cwd: string = repo): Promise<boolean> {
    return (await call<GitPredicateOutput>(["git", name], { cwd })).value;
  }

  it("tell the state of a clean repository", async () => {
    expect(await value("isClean")).toBe(true);
    expect(await value("hasChanges")).toBe(false);
    expect(await value("hasStagedChanges")).toBe(false);
    expect(await value("hasUnstagedChanges")).toBe(false);
    expect(await value("hasUntrackedFiles")).toBe(false);
    expect(await value("hasLocalCommits")).toBe(false);
  });

  it("tell each kind of change", async () => {
    writeFileSync(join(repo, "a.txt"), "two\n");
    expect(await value("hasUnstagedChanges")).toBe(true);
    expect(await value("hasStagedChanges")).toBe(false);
    git(repo, "add", "a.txt");
    expect(await value("hasStagedChanges")).toBe(true);
    expect(await value("hasUnstagedChanges")).toBe(false);
    writeFileSync(join(repo, "new.txt"), "new\n");
    expect(await value("hasUntrackedFiles")).toBe(true);
    expect(await value("hasChanges")).toBe(true);
    expect(await value("isClean")).toBe(false);
    git(repo, "commit", "-q", "-m", "second");
    expect(await value("hasLocalCommits")).toBe(true);
  });

  it("give false outside a repository, as a failed command", async () => {
    const empty = join(base, "empty");
    mkdirSync(empty);
    for (const name of ["hasChanges", "hasStagedChanges", "hasUnstagedChanges", "hasUntrackedFiles", "hasLocalCommits"]) {
      expect(await value(name, empty)).toBe(false);
    }
  });
});

describe("git.stash.*", () => {
  it("pushes, lists, applies, pops and drops a stash", async () => {
    writeFileSync(join(repo, "a.txt"), "stashed\n");
    expect(await call<GitStashPushOutput>(["git", "stash", "push"], { cwd: repo, message: "wip" })).toEqual({ stashed: true, ref: "stash@{0}", message: "wip" });
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("one\n");

    const list = await call<GitStashListOutput>(["git", "stash", "list"], { cwd: repo });
    expect(list.count).toBe(1);
    expect(list.stashes[0]).toMatchObject({ index: 0, ref: "stash@{0}" });
    expect(list.stashes[0]?.message).toContain("wip");

    expect(await call<GitStashApplyOutput>(["git", "stash", "apply"], { cwd: repo })).toEqual({ applied: true, ref: "stash@{0}" });
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("stashed\n");
    git(repo, "checkout", "--", "a.txt");

    expect(await call<GitStashPopOutput>(["git", "stash", "pop"], { cwd: repo })).toEqual({ applied: true, ref: "stash@{0}", dropped: true });
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("stashed\n");
    expect((await call<GitStashListOutput>(["git", "stash", "list"], { cwd: repo })).count).toBe(0);

    git(repo, "stash", "push", "-q", "-m", "again");
    expect(await call<GitStashDropOutput>(["git", "stash", "drop"], { cwd: repo })).toEqual({ dropped: true, ref: "stash@{0}" });
    expect((await call<GitStashListOutput>(["git", "stash", "list"], { cwd: repo })).count).toBe(0);
  });

  it("stashes untracked files with includeUntracked", async () => {
    writeFileSync(join(repo, "new.txt"), "new\n");
    expect((await call<GitStashPushOutput>(["git", "stash", "push"], { cwd: repo, includeUntracked: true })).stashed).toBe(true);
    expect(existsSync(join(repo, "new.txt"))).toBe(false);
  });

  it("gives stashed: false when there is nothing to stash", async () => {
    expect(await call<GitStashPushOutput>(["git", "stash", "push"], { cwd: repo })).toEqual({ stashed: false, message: "No local changes to save" });
  });

  it("gives applied: false or dropped: false for a missing stash, and an empty list outside a repository", async () => {
    expect(await call<GitStashApplyOutput>(["git", "stash", "apply"], { cwd: repo, index: 3 })).toEqual({ applied: false, ref: "stash@{3}" });
    expect(await call<GitStashPopOutput>(["git", "stash", "pop"], { cwd: repo })).toMatchObject({ applied: false, dropped: false });
    expect(await call<GitStashDropOutput>(["git", "stash", "drop"], { cwd: repo })).toEqual({ dropped: false, ref: "stash@{0}" });
    const empty = join(base, "empty");
    mkdirSync(empty);
    expect(await call<GitStashListOutput>(["git", "stash", "list"], { cwd: empty })).toEqual({ stashes: [], count: 0 });
  });

  it("exports a stash as a patch, and imports the patch as a new stash", async () => {
    writeFileSync(join(repo, "a.txt"), "one\nexported\n");
    git(repo, "stash", "push", "-q", "-m", "to export");
    const exported = await call<GitStashExportOutput>(["git", "stash", "export"], { cwd: repo });
    expect(exported).toMatchObject({ ref: "stash@{0}", hasUntracked: false });
    expect(exported.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(exported.patch).toContain("+exported");
    git(repo, "stash", "drop", "-q");

    const imported = await call<GitStashImportOutput>(["git", "stash", "import"], { cwd: repo, patch: exported.patch, message: "imported" });
    expect(imported).toEqual({ imported: true, ref: "stash@{0}" });
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("one\n");
    git(repo, "stash", "pop", "-q");
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("one\nexported\n");
  });

  it("fails to export a missing stash, and reports a patch that does not apply", async () => {
    await expect(call(["git", "stash", "export"], { cwd: repo })).rejects.toThrow(/Failed to export stash stash@\{0\}/);
    const result = await call<GitStashImportOutput>(["git", "stash", "import"], { cwd: repo, patch: "not a patch\n" });
    expect(result.imported).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
