/**
 * The git procedures of roadmap R40 through a registry of `gitModule`: the happy path, the main
 * errors, and a path that starts with "-". The tests run the real `git` in the temporary
 * repositories of `test/repos.ts`.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { call, git, initRepo, useRepos } from "../test/repos.js";
import { gitModule } from "./module.js";
import type {
  GitBlameOutput,
  GitBranchAddOutput,
  GitBranchDeleteOutput,
  GitBranchListOutput,
  GitBranchOutput,
  GitMergeAbortOutput,
  GitMergeOutput,
  GitRebaseAbortOutput,
  GitRebaseOutput,
  GitResetOutput,
  GitRestoreOutput,
  GitRevParseOutput,
  GitShowOutput,
  GitTagAddOutput,
  GitTagDeleteOutput,
  GitTagListOutput,
  GitWorktreeAddOutput,
  GitWorktreeListOutput,
  GitWorktreeRemoveOutput,
} from "./types.js";

const repos = useRepos();
let base: string;
let repo: string;

beforeEach(() => {
  ({ base, repo } = repos);
});

/** The hash of a ref, as git gives it. */
function hashOf(ref: string, cwd: string = repo): string {
  return git(cwd, "rev-parse", ref).trim();
}

/** This function writes a file and commits it. */
function commitFile(name: string, content: string, message: string, cwd: string = repo): string {
  writeFileSync(join(cwd, name), content);
  git(cwd, "add", "--", name);
  git(cwd, "commit", "-q", "-m", message);
  return hashOf("HEAD", cwd);
}

/**
 * Two branches that change the same line of a.txt: `clash` and `main`, from the first commit.
 * HEAD is main.
 */
function divergedBranches(): void {
  git(repo, "checkout", "-q", "-b", "clash");
  commitFile("a.txt", "clash\n", "clash");
  git(repo, "checkout", "-q", "main");
  commitFile("a.txt", "main\n", "main");
}

describe("git.show", () => {
  it("gives the fields, the files and the diff of a commit", async () => {
    const hash = commitFile("b.txt", "b\n", "second\n\nThe body.");
    const shown = await call<GitShowOutput>(["git", "show"], { cwd: repo });
    expect(shown).toMatchObject({ ref: "HEAD", hash, author: "Test", email: "test@example.com", message: "second", body: "The body." });
    expect(shown.files).toEqual([{ path: "b.txt", additions: 1, deletions: 0 }]);
    expect(shown.diff).toContain("+b");
    const stat = await call<GitShowOutput>(["git", "show"], { cwd: repo, ref: "HEAD~1", stat: true });
    expect(stat).toMatchObject({ message: "first", files: [{ path: "a.txt", additions: 1, deletions: 0 }] });
    expect(stat.diff).toBeUndefined();
  });

  it("gives the content of a file at a commit, also for a path that starts with -", async () => {
    commitFile("a.txt", "two\n", "second");
    commitFile("-n", "dash\n", "dash");
    expect(await call<GitShowOutput>(["git", "show"], { cwd: repo, ref: "HEAD~2", path: "a.txt" })).toMatchObject({ path: "a.txt", content: "one\n" });
    expect((await call<GitShowOutput>(["git", "show"], { cwd: repo, path: "-n" })).content).toBe("dash\n");
  });

  it("gives the commit of an annotated tag, and fails for an unknown ref or a missing file", async () => {
    git(repo, "tag", "-a", "-m", "release", "v1");
    expect((await call<GitShowOutput>(["git", "show"], { cwd: repo, ref: "v1" })).hash).toBe(hashOf("HEAD"));
    await expect(call(["git", "show"], { cwd: repo, ref: "no-such-ref" })).rejects.toThrow(/no-such-ref/);
    await expect(call(["git", "show"], { cwd: repo, path: "missing.txt" })).rejects.toThrow(/missing\.txt/);
    await expect(call(["git", "show"], { cwd: repo, ref: "--output=x" })).rejects.toThrow(/must not start with "-"/);
  });
});

describe("git.blame", () => {
  it("gives the commit, the author and the text of each line", async () => {
    const first = hashOf("HEAD");
    const second = commitFile("a.txt", "one\ntwo\nthree\n", "more lines");
    const blame = await call<GitBlameOutput>(["git", "blame"], { cwd: repo, path: "a.txt" });
    expect(blame.lines.map((line) => [line.line, line.hash, line.content])).toEqual([
      [1, first, "one"],
      [2, second, "two"],
      [3, second, "three"],
    ]);
    expect(blame.lines[1]).toMatchObject({ author: "Test", email: "test@example.com", summary: "more lines" });
    expect(Date.parse(blame.lines[1]!.date)).not.toBeNaN();
    const range = await call<GitBlameOutput>(["git", "blame"], { cwd: repo, path: "a.txt", startLine: 2, endLine: 2 });
    expect(range.lines.map((line) => line.content)).toEqual(["two"]);
    const atFirst = await call<GitBlameOutput>(["git", "blame"], { cwd: repo, path: "a.txt", ref: first });
    expect(atFirst.lines).toHaveLength(1);
  });

  it("gives zeros for a line that is not committed, and reads a path that starts with -", async () => {
    writeFileSync(join(repo, "a.txt"), "one\nnew\n");
    const blame = await call<GitBlameOutput>(["git", "blame"], { cwd: repo, path: "a.txt" });
    expect(blame.lines[1]?.hash).toMatch(/^0+$/);
    commitFile("-n", "dash\n", "dash");
    expect((await call<GitBlameOutput>(["git", "blame"], { cwd: repo, path: "-n" })).lines[0]?.content).toBe("dash");
  });

  it("fails for a missing file, and refuses a line number below 1", async () => {
    await expect(call(["git", "blame"], { cwd: repo, path: "missing.txt" })).rejects.toThrow(/missing\.txt/);
    await expect(call(["git", "blame"], { cwd: repo, path: "a.txt", startLine: 0 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("git.tag.*", () => {
  it("adds a tag and an annotated tag, lists them, and deletes one", async () => {
    const head = hashOf("HEAD");
    expect(await call<GitTagAddOutput>(["git", "tag", "add"], { cwd: repo, name: "v1.0" })).toEqual({ name: "v1.0", hash: head, annotated: false });
    expect(await call<GitTagAddOutput>(["git", "tag", "add"], { cwd: repo, name: "v2.0", message: "Release 2" })).toEqual({ name: "v2.0", hash: head, annotated: true });

    const list = await call<GitTagListOutput>(["git", "tag", "list"], { cwd: repo });
    expect(list.tags).toEqual([
      { name: "v1.0", hash: head, annotated: false },
      { name: "v2.0", hash: head, annotated: true, message: "Release 2" },
    ]);
    expect((await call<GitTagListOutput>(["git", "tag", "list"], { cwd: repo, pattern: "v2*" })).tags.map((tag) => tag.name)).toEqual(["v2.0"]);

    const tagObject = hashOf("refs/tags/v2.0");
    expect(await call<GitTagDeleteOutput>(["git", "tag", "delete"], { cwd: repo, name: "v2.0" })).toEqual({ name: "v2.0", hash: tagObject });
    expect((await call<GitTagListOutput>(["git", "tag", "list"], { cwd: repo })).tags.map((tag) => tag.name)).toEqual(["v1.0"]);
  });

  it("tags another commit, and gives an empty list without tags", async () => {
    const first = hashOf("HEAD");
    commitFile("a.txt", "two\n", "second");
    expect((await call<GitTagListOutput>(["git", "tag", "list"], { cwd: repo })).tags).toEqual([]);
    expect((await call<GitTagAddOutput>(["git", "tag", "add"], { cwd: repo, name: "old", ref: "HEAD~1" })).hash).toBe(first);
  });

  it("fails for a tag that exists or is missing, and refuses a name that starts with -", async () => {
    git(repo, "tag", "v1");
    await expect(call(["git", "tag", "add"], { cwd: repo, name: "v1" })).rejects.toThrow(/already exists/);
    await expect(call(["git", "tag", "delete"], { cwd: repo, name: "missing" })).rejects.toThrow(/missing/);
    await expect(call(["git", "tag", "add"], { cwd: repo, name: "-f" })).rejects.toThrow(/must not start with "-"/);
  });
});

describe("git.revParse", () => {
  it("gives the hash, the short hash and the short name of a ref", async () => {
    const head = hashOf("HEAD");
    expect(await call<GitRevParseOutput>(["git", "revParse"], { cwd: repo })).toEqual({ ref: "HEAD", value: head });
    expect(await call<GitRevParseOutput>(["git", "revParse"], { cwd: repo, abbrevRef: true })).toEqual({ ref: "HEAD", value: "main" });
    expect((await call<GitRevParseOutput>(["git", "revParse"], { cwd: repo, ref: "main", short: true })).value).toBe(head.slice(0, 7));
    expect((await call<GitRevParseOutput>(["git", "revParse"], { cwd: repo, ref: "origin/main" })).value).toBe(head);
  });

  it("fails for an unknown ref and for a ref that starts with -", async () => {
    await expect(call(["git", "revParse"], { cwd: repo, ref: "no-such-ref" })).rejects.toThrow(/Needed a single revision/);
    await expect(call(["git", "revParse"], { cwd: repo, ref: "--git-dir" })).rejects.toThrow(/must not start with "-"/);
  });
});

describe("git.reset", () => {
  it("unstages with mixed, keeps the index with soft, and moves HEAD", async () => {
    const first = hashOf("HEAD");
    commitFile("a.txt", "two\n", "second");
    expect(await call<GitResetOutput>(["git", "reset"], { cwd: repo, ref: "HEAD~1", mode: "soft" })).toEqual({ ref: "HEAD~1", mode: "soft", hash: first });
    expect(git(repo, "diff", "--cached", "--name-only").trim()).toBe("a.txt");
    expect(await call<GitResetOutput>(["git", "reset"], { cwd: repo })).toEqual({ ref: "HEAD", mode: "mixed", hash: first });
    expect(git(repo, "diff", "--cached", "--name-only").trim()).toBe("");
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("two\n");
  });

  it("deletes the changes of the working tree with hard", async () => {
    writeFileSync(join(repo, "a.txt"), "changed\n");
    await call(["git", "reset"], { cwd: repo, mode: "hard" });
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("one\n");
  });

  it("resets only the given paths in the index, and refuses paths with another mode", async () => {
    writeFileSync(join(repo, "a.txt"), "changed\n");
    writeFileSync(join(repo, "-n"), "dash\n");
    git(repo, "add", "--", "a.txt", "-n");
    await call(["git", "reset"], { cwd: repo, paths: ["-n"] });
    expect(git(repo, "diff", "--cached", "--name-only").trim()).toBe("a.txt");
    await expect(call(["git", "reset"], { cwd: repo, mode: "hard", paths: ["a.txt"] })).rejects.toThrow(/mode mixed/);
    await expect(call(["git", "reset"], { cwd: repo, mode: "all" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("git.restore", () => {
  it("restores the working tree, the index, and a file from another commit", async () => {
    writeFileSync(join(repo, "a.txt"), "changed\n");
    expect(await call<GitRestoreOutput>(["git", "restore"], { cwd: repo, paths: ["a.txt"] })).toEqual({ restored: ["a.txt"] });
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("one\n");

    writeFileSync(join(repo, "a.txt"), "staged\n");
    git(repo, "add", "a.txt");
    await call(["git", "restore"], { cwd: repo, paths: ["a.txt"], staged: true });
    expect(git(repo, "diff", "--cached", "--name-only").trim()).toBe("");
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("staged\n");

    commitFile("a.txt", "two\n", "second");
    await call(["git", "restore"], { cwd: repo, paths: ["a.txt"], source: "HEAD~1" });
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("one\n");
  });

  it("restores a path that starts with -, and refuses an empty list of paths", async () => {
    commitFile("-n", "dash\n", "dash");
    writeFileSync(join(repo, "-n"), "changed\n");
    await call(["git", "restore"], { cwd: repo, paths: ["-n"] });
    expect(readFileSync(join(repo, "-n"), "utf8")).toBe("dash\n");
    await expect(call(["git", "restore"], { cwd: repo, paths: [] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("starts the post-checkout hook (so it declares that it writes process)", async () => {
    const hook = join(repo, ".git", "hooks", "post-checkout");
    writeFileSync(hook, "#!/bin/sh\necho ran > hook-ran.txt\n");
    chmodSync(hook, 0o755);
    writeFileSync(join(repo, "a.txt"), "changed\n");
    await call(["git", "restore"], { cwd: repo, paths: ["a.txt"] });
    expect(readFileSync(join(repo, "hook-ran.txt"), "utf8").trim()).toBe("ran");
  });
});

describe("git.merge and git.merge.abort", () => {
  it("fast-forwards, then is up to date", async () => {
    git(repo, "checkout", "-q", "-b", "topic");
    const topic = commitFile("t.txt", "t\n", "topic");
    git(repo, "checkout", "-q", "main");
    expect(await call<GitMergeOutput>(["git", "merge"], { cwd: repo, ref: "topic" })).toEqual({
      ref: "topic",
      hash: topic,
      fastForward: true,
      upToDate: false,
      conflict: false,
    });
    expect(await call<GitMergeOutput>(["git", "merge"], { cwd: repo, ref: "topic" })).toMatchObject({ hash: topic, fastForward: false, upToDate: true });
  });

  it("makes a merge commit with never, and fails with only when the branches diverged", async () => {
    git(repo, "checkout", "-q", "-b", "topic");
    commitFile("t.txt", "t\n", "topic");
    git(repo, "checkout", "-q", "main");
    commitFile("m.txt", "m\n", "on main");
    await expect(call(["git", "merge"], { cwd: repo, ref: "topic", fastForward: "only" })).rejects.toThrow(/fast-forward/i);
    const merged = await call<GitMergeOutput>(["git", "merge"], { cwd: repo, ref: "topic", fastForward: "never", message: "Merge topic" });
    expect(merged).toMatchObject({ fastForward: false, upToDate: false, conflict: false });
    expect(git(repo, "log", "-1", "--format=%s%n%P").trim().split("\n")).toEqual(["Merge topic", expect.stringMatching(/^\w+ \w+$/)]);
  });

  it("gives the files with conflicts, and git.merge.abort puts back the branch", async () => {
    divergedBranches();
    const main = hashOf("HEAD");
    expect(await call<GitMergeOutput>(["git", "merge"], { cwd: repo, ref: "clash" })).toEqual({
      ref: "clash",
      hash: main,
      fastForward: false,
      upToDate: false,
      conflict: true,
      conflicts: ["a.txt"],
    });
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toContain("<<<<<<<");
    expect(await call<GitMergeAbortOutput>(["git", "merge", "abort"], { cwd: repo })).toEqual({ aborted: true, hash: main });
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("main\n");
    await expect(call(["git", "merge", "abort"], { cwd: repo })).rejects.toThrow(/no merge to abort/i);
  });

  it("fails for an unknown ref", async () => {
    await expect(call(["git", "merge"], { cwd: repo, ref: "no-such-branch" })).rejects.toThrow(/no-such-branch/);
  });
});

describe("git.rebase, git.rebase.continue and git.rebase.abort", () => {
  it("rebases the branch on another branch, then is up to date", async () => {
    git(repo, "checkout", "-q", "-b", "topic");
    commitFile("t.txt", "t\n", "topic");
    git(repo, "checkout", "-q", "main");
    const main = commitFile("m.txt", "m\n", "on main");
    git(repo, "checkout", "-q", "topic");
    const rebased = await call<GitRebaseOutput>(["git", "rebase"], { cwd: repo, upstream: "main" });
    expect(rebased).toMatchObject({ completed: true, upToDate: false, conflict: false });
    expect(hashOf("HEAD~1")).toBe(main);
    expect(await call<GitRebaseOutput>(["git", "rebase"], { cwd: repo, upstream: "main" })).toMatchObject({ completed: true, upToDate: true, hash: rebased.hash });
  });

  it("stops on conflicts, then continues after the resolution without an editor", async () => {
    divergedBranches();
    const clash = hashOf("clash");
    const stopped = await call<GitRebaseOutput>(["git", "rebase"], { cwd: repo, upstream: "clash" });
    expect(stopped).toMatchObject({ completed: false, conflict: true, conflicts: ["a.txt"] });
    // A continue with the conflict still in the file gives the conflict again
    expect(await call<GitRebaseOutput>(["git", "rebase", "continue"], { cwd: repo })).toMatchObject({ completed: false, conflict: true, conflicts: ["a.txt"] });
    writeFileSync(join(repo, "a.txt"), "resolved\n");
    git(repo, "add", "a.txt");
    const done = await call<GitRebaseOutput>(["git", "rebase", "continue"], { cwd: repo });
    expect(done).toMatchObject({ completed: true, conflict: false });
    expect(hashOf("HEAD~1")).toBe(clash);
    expect(git(repo, "log", "-1", "--format=%s").trim()).toBe("main");
    expect(git(repo, "symbolic-ref", "--short", "HEAD").trim()).toBe("main");
  });

  it("aborts a rebase, and goes back to the branch as it was", async () => {
    divergedBranches();
    const main = hashOf("HEAD");
    await call(["git", "rebase"], { cwd: repo, upstream: "clash" });
    expect(await call<GitRebaseAbortOutput>(["git", "rebase", "abort"], { cwd: repo })).toEqual({ aborted: true, hash: main });
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("main\n");
    await expect(call(["git", "rebase", "abort"], { cwd: repo })).rejects.toThrow(/no rebase in progress/i);
    await expect(call(["git", "rebase", "continue"], { cwd: repo })).rejects.toThrow(/no rebase in progress/i);
  });

  it("refuses a working tree with changes, and an upstream that starts with -", async () => {
    git(repo, "checkout", "-q", "-b", "topic");
    commitFile("t.txt", "t\n", "topic");
    git(repo, "checkout", "-q", "main");
    commitFile("m.txt", "m\n", "on main");
    writeFileSync(join(repo, "a.txt"), "changed\n");
    await expect(call(["git", "rebase"], { cwd: repo, upstream: "topic" })).rejects.toThrow(/unstaged changes|uncommitted changes/i);
    await expect(call(["git", "rebase"], { cwd: repo, upstream: "--exec=x" })).rejects.toThrow(/must not start with "-"/);
  });
});

describe("git.worktree.*", () => {
  it("adds a working tree with a new branch and one without a branch, lists them, and removes them", async () => {
    const head = hashOf("HEAD");
    const added = await call<GitWorktreeAddOutput>(["git", "worktree", "add"], { cwd: repo, path: "../feature", branch: "feature" });
    expect(added).toEqual({ path: join(base, "feature"), head, branch: "feature" });
    expect(readFileSync(join(base, "feature", "a.txt"), "utf8")).toBe("one\n");
    // A path that starts with "-" stays a path
    const detached = await call<GitWorktreeAddOutput>(["git", "worktree", "add"], { cwd: repo, path: "-wt", ref: "HEAD", detach: true });
    expect(detached).toEqual({ path: join(repo, "-wt"), head });

    const list = await call<GitWorktreeListOutput>(["git", "worktree", "list"], { cwd: repo });
    const real = (path: string): string => realpathSync.native(path);
    expect(list.worktrees.map((tree) => [real(tree.path), tree.branch, tree.detached])).toEqual([
      [real(repo), "main", false],
      [real(join(base, "feature")), "feature", false],
      [real(join(repo, "-wt")), undefined, true],
    ]);

    expect(await call<GitWorktreeRemoveOutput>(["git", "worktree", "remove"], { cwd: repo, path: "-wt" })).toEqual({ path: "-wt" });
    expect(existsSync(join(repo, "-wt"))).toBe(false);
    await call(["git", "worktree", "remove"], { cwd: repo, path: join(base, "feature") });
    expect((await call<GitWorktreeListOutput>(["git", "worktree", "list"], { cwd: repo })).worktrees).toHaveLength(1);
  });

  it("refuses a folder that is not empty, and a working tree with changes without force", async () => {
    await expect(call(["git", "worktree", "add"], { cwd: base, path: "repo" })).rejects.toThrow(/not a git repository|already exists/i);
    await call(["git", "worktree", "add"], { cwd: repo, path: join(base, "wt"), detach: true });
    await expect(call(["git", "worktree", "add"], { cwd: repo, path: join(base, "wt"), detach: true })).rejects.toThrow(/already exists/);
    writeFileSync(join(base, "wt", "a.txt"), "changed\n");
    await expect(call(["git", "worktree", "remove"], { cwd: repo, path: join(base, "wt") })).rejects.toThrow(/modified or untracked|--force/);
    await call(["git", "worktree", "remove"], { cwd: repo, path: join(base, "wt"), force: true });
    expect(existsSync(join(base, "wt"))).toBe(false);
  });
});

describe("git.branch.list, git.branch.add and git.branch.delete", () => {
  it("add, list and delete a branch", async () => {
    const head = hashOf("HEAD");
    expect(await call<GitBranchAddOutput>(["git", "branch", "add"], { cwd: repo, name: "feature/x" })).toEqual({ name: "feature/x", hash: head });
    const list = await call<GitBranchListOutput>(["git", "branch", "list"], { cwd: repo });
    expect(list.current).toBe("main");
    expect(list.branches.map((branch) => [branch.name, branch.remote])).toEqual([
      ["feature/x", false],
      ["main", false],
    ]);
    expect(list.branches.find((branch) => branch.name === "main")).toMatchObject({ current: true, tracking: "origin/main" });
    const all = await call<GitBranchListOutput>(["git", "branch", "list"], { cwd: repo, remote: true });
    expect(all.branches.filter((branch) => branch.remote).map((branch) => branch.name)).toEqual(["origin/main"]);
    expect(await call<GitBranchDeleteOutput>(["git", "branch", "delete"], { cwd: repo, name: "feature/x" })).toEqual({ name: "feature/x", hash: head });
    expect(git(repo, "branch", "--list", "feature/x").trim()).toBe("");
  });

  it("make a branch at a start point, and delete a branch that is not merged only with force", async () => {
    const first = hashOf("HEAD");
    commitFile("a.txt", "two\n", "second");
    expect((await call<GitBranchAddOutput>(["git", "branch", "add"], { cwd: repo, name: "old", startPoint: "HEAD~1" })).hash).toBe(first);
    git(repo, "checkout", "-q", "-b", "work");
    const work = commitFile("w.txt", "w\n", "work");
    git(repo, "checkout", "-q", "main");
    await expect(call(["git", "branch", "delete"], { cwd: repo, name: "work" })).rejects.toThrow(/not fully merged/);
    expect(await call<GitBranchDeleteOutput>(["git", "branch", "delete"], { cwd: repo, name: "work", force: true })).toEqual({ name: "work", hash: work });
  });

  it("fail for a branch that exists or is missing, and refuse a name that starts with -", async () => {
    await expect(call(["git", "branch", "add"], { cwd: repo, name: "main" })).rejects.toThrow(/already exists/);
    await expect(call(["git", "branch", "delete"], { cwd: repo, name: "missing" })).rejects.toThrow(/not found/);
    await expect(call(["git", "branch", "add"], { cwd: repo, name: "-D" })).rejects.toThrow(/must not start with "-"/);
  });

  it("give the current branch of a repository without commits (R33: rev-parse failed there)", async () => {
    const empty = join(base, "empty");
    initRepo(empty);
    expect(await call<GitBranchListOutput>(["git", "branch", "list"], { cwd: empty })).toEqual({ branches: [], current: "main" });
    // The deprecated procedure calls the same code
    expect(await call<GitBranchOutput>(["git", "branch"], { cwd: empty })).toEqual({ branches: [], current: "main" });
  });

  it("give HEAD for a detached HEAD, and fail outside a repository", async () => {
    git(repo, "checkout", "-q", "--detach");
    expect((await call<GitBranchListOutput>(["git", "branch", "list"], { cwd: repo })).current).toBe("HEAD");
    const outside = join(base, "outside");
    mkdirSync(outside);
    await expect(call(["git", "branch", "list"], { cwd: outside })).rejects.toThrow(/not a git repository/i);
  });
});

describe("git.branch (deprecated)", () => {
  it("is marked deprecated, and names the new procedures", () => {
    const procedure = gitModule.procedures.find((item) => item.path.join(".") === "git.branch");
    expect(procedure?.metadata).toMatchObject({ deprecated: true });
    expect(procedure?.metadata.description).toMatch(/git\.branch\.list, git\.branch\.add or git\.branch\.delete/);
  });
});
