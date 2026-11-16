/**
 * The tests of the file readers of a repository (roadmap CLI-123). Each test compares the result of
 * the files with the answer of git for the same repository.
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, initRepo, useRepos } from "../../../test/repos.js";
import { gitDirsOf, onRemote, readHead, readRefs, readWorktrees } from "./files.js";
import { parseWorktrees } from "./worktree/list.js";

const repos = useRepos();

/** The path with its links and short names resolved, so two spellings of one folder compare equal. */
const real = (path: string): string => {
  try {
    return realpathSync.native(path);
  } catch {
    // A missing folder (a prunable tree) keeps its spelling
    return path;
  }
};

/** The working trees as `git worktree list` gives them, with real paths. */
function gitWorktrees(cwd: string): unknown[] {
  return parseWorktrees(git(cwd, "worktree", "list", "--porcelain", "-z")).map((tree) => ({ ...tree, path: real(tree.path) }));
}

/** The working trees of the files, with real paths. */
async function fileWorktrees(cwd: string): Promise<unknown[]> {
  return (await readWorktrees(cwd)).map((tree) => ({ ...tree, path: real(tree.path) }));
}

/** The refs as `git for-each-ref` gives them: each full name and its hash. */
function gitRefs(cwd: string): Map<string, string> {
  const out = git(cwd, "for-each-ref", "--format=%(refname) %(objectname)");
  return new Map(out.split("\n").filter((line) => line !== "").map((line) => line.split(" ") as [string, string]));
}

/** This function makes a commit with one changed file. */
function commit(cwd: string, message: string): string {
  writeFileSync(join(cwd, `${message}.txt`), `${message}\n`);
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD").trim();
}

describe("readWorktrees (CLI-123)", () => {
  it("gives the main tree and two linked trees, a branch and a detached head, as git worktree list does", async () => {
    git(repos.repo, "worktree", "add", "-q", "-b", "feature", join(repos.base, "feature"));
    git(repos.repo, "worktree", "add", "-q", "--detach", join(repos.base, "detached"), "HEAD");
    commit(join(repos.base, "feature"), "on-feature");
    const trees = await fileWorktrees(repos.repo);
    expect(trees).toEqual(gitWorktrees(repos.repo));
    expect(trees.map((tree) => (tree as { branch?: string }).branch)).toEqual(["main", undefined, "feature"]);
    // Any tree of the repository gives the same list
    expect(await fileWorktrees(join(repos.base, "feature"))).toEqual(trees);
    expect(await fileWorktrees(join(repos.repo, ".git"))).toEqual(trees);
  });

  it("marks a tree whose folder is gone as prunable, and a locked tree as locked", async () => {
    git(repos.repo, "worktree", "add", "-q", "-b", "gone", join(repos.base, "gone"));
    git(repos.repo, "worktree", "add", "-q", "-b", "kept", join(repos.base, "kept"));
    git(repos.repo, "worktree", "lock", join(repos.base, "kept"));
    rmSync(join(repos.base, "gone"), { recursive: true, force: true });
    const trees = await fileWorktrees(repos.repo);
    expect(trees).toEqual(gitWorktrees(repos.repo));
    expect(trees.map((tree) => [(tree as { branch?: string }).branch, (tree as { prunable: boolean }).prunable, (tree as { locked: boolean }).locked])).toEqual([
      ["main", false, false],
      ["gone", true, false],
      ["kept", false, true],
    ]);
  });

  it("gives a bare main entry for the trees of a bare repository", async () => {
    git(repos.origin, "worktree", "add", "-q", join(repos.base, "from-bare"), "main");
    const trees = await fileWorktrees(repos.origin);
    expect(trees).toEqual(gitWorktrees(repos.origin));
    expect(trees[0]).toMatchObject({ bare: true });
  });

  it("gives only the main tree for a repository with no linked trees", async () => {
    expect(await fileWorktrees(repos.repo)).toEqual(gitWorktrees(repos.repo));
  });
});

describe("readHead (CLI-123)", () => {
  it("reads the branch and its commit, a detached commit through the file .git, and a branch with no commit", async () => {
    expect(await readHead(repos.repo)).toEqual({ head: git(repos.repo, "rev-parse", "HEAD").trim(), branch: "main", detached: false });
    const detached = join(repos.base, "detached");
    git(repos.repo, "worktree", "add", "-q", "--detach", detached, "HEAD");
    const sha = commit(detached, "detached-commit");
    expect(await readHead(detached)).toEqual({ head: sha, detached: true });
    const empty = join(repos.base, "empty");
    initRepo(empty);
    expect(await readHead(empty)).toEqual({ branch: "main", detached: false });
  });

  it("refuses a folder that is not in git", async () => {
    const plain = join(repos.base, "plain");
    mkdirSync(plain);
    await expect(readHead(plain)).rejects.toThrow(/is not a git working tree/);
    await expect(gitDirsOf(plain)).rejects.toThrow(/is not a git working tree/);
  });
});

describe("readRefs (CLI-123)", () => {
  it("reads packed and loose refs, an annotated tag, remote refs and a symbolic ref, as git for-each-ref does", async () => {
    git(repos.repo, "tag", "-a", "v1", "-m", "first tag");
    git(repos.repo, "branch", "packed-only");
    git(repos.repo, "remote", "set-head", "origin", "main");
    git(repos.repo, "pack-refs", "--all");
    // A loose ref after the pack takes the place of its packed line
    const sha = commit(repos.repo, "after-pack");
    git(repos.repo, "branch", "loose-only");
    const refs = await readRefs(repos.repo);
    expect(refs).toEqual(gitRefs(repos.repo));
    expect(refs.get("refs/heads/main")).toBe(sha);
    expect(refs.get("refs/remotes/origin/HEAD")).toBe(refs.get("refs/remotes/origin/main"));
    expect(refs.has("refs/tags/v1")).toBe(true);
    // A linked tree reads the same refs
    git(repos.repo, "worktree", "add", "-q", "--detach", join(repos.base, "linked"), "HEAD");
    expect(await readRefs(join(repos.base, "linked"))).toEqual(refs);
  });
});

describe("onRemote (CLI-123)", () => {
  it("gives true for the commit of a remote ref, and unknown for a commit that no remote ref points at", async () => {
    const pushed = git(repos.repo, "rev-parse", "HEAD").trim();
    expect(await onRemote(repos.repo, pushed)).toBe(true);
    expect(await onRemote(repos.repo, pushed.toUpperCase())).toBe(true);
    const local = commit(repos.repo, "local-only");
    expect(await onRemote(repos.repo, local)).toBe("unknown");
    // The files do not tell whether the commit is in the history of a remote ref
    git(repos.repo, "push", "-q", "origin", "main");
    expect(await onRemote(repos.repo, pushed)).toBe("unknown");
    expect(await onRemote(repos.repo, local)).toBe(true);
    expect(await onRemote(repos.repo, "abc123")).toBe("unknown");
  });
});
