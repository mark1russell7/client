/**
 * The declared effects of each git procedure against what it does (roadmap R33). Each test
 * starts from one prepared state of the repositories of `test/repos.ts`, calls the procedure,
 * and compares the files and the state of the repositories before and after.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Effects } from "@procedures/client";
import { gitModule } from "./module.js";
import { call, git, useRepos } from "../test/repos.js";

const repos = useRepos();
let base: string;
let repo: string;
let origin: string;

beforeEach(() => {
  ({ base, repo, origin } = repos);
});

const READS: Effects = { reads: ["fs"], writes: [] };
const CHANGES: Effects = { reads: ["fs"], writes: ["fs"] };
const HOOKS: Effects = { reads: ["fs"], writes: ["fs", "process"] };
const ADDS: Effects = { reads: ["fs"], writes: ["fs"], destructive: false, idempotent: true };
const DELETES: Effects = { reads: ["fs"], writes: ["fs"], destructive: true, idempotent: true };

/** The declaration of each procedure, as `metadata.effects` gives it. */
const DECLARED: Record<string, Effects> = {
  "git.status": READS,
  "git.log": READS,
  "git.diff": READS,
  "git.remote": READS,
  "git.hasChanges": READS,
  "git.hasStagedChanges": READS,
  "git.hasUnstagedChanges": READS,
  "git.hasUntrackedFiles": READS,
  "git.hasLocalCommits": READS,
  "git.isClean": READS,
  "git.stash.list": READS,
  "git.stash.export": READS,
  "git.add": { reads: ["fs"], writes: ["fs"], destructive: false, idempotent: true },
  "git.commit": HOOKS,
  "git.push": { reads: ["fs", "network"], writes: ["fs", "network", "process"], idempotent: true },
  "git.pull": { reads: ["fs", "network"], writes: ["fs", "process"], idempotent: true },
  "git.clone": { reads: ["fs", "network"], writes: ["fs"], destructive: false, idempotent: true },
  "git.checkout": { reads: ["fs"], writes: ["fs", "process"], idempotent: true },
  "git.branch": { reads: ["fs"], writes: ["fs"], idempotent: true },
  "git.init": { reads: ["fs"], writes: ["fs"], destructive: false, idempotent: true },
  "git.remote.set": { reads: ["fs"], writes: ["fs"], idempotent: true },
  "git.fetch": { reads: ["fs", "network"], writes: ["fs"], idempotent: true },
  "git.stash.push": CHANGES,
  "git.stash.pop": CHANGES,
  "git.stash.apply": CHANGES,
  "git.stash.drop": CHANGES,
  "git.stash.import": CHANGES,
  // Roadmap R40
  "git.show": READS,
  "git.blame": READS,
  "git.tag.list": READS,
  "git.revParse": READS,
  "git.worktree.list": READS,
  "git.branch.list": READS,
  "git.tag.add": ADDS,
  "git.branch.add": ADDS,
  "git.tag.delete": DELETES,
  "git.branch.delete": DELETES,
  "git.worktree.remove": DELETES,
  "git.merge.abort": DELETES,
  "git.rebase.abort": DELETES,
  "git.reset": { reads: ["fs"], writes: ["fs"], destructive: true },
  "git.restore": { reads: ["fs"], writes: ["fs", "process"], destructive: true, idempotent: true },
  "git.merge": { reads: ["fs"], writes: ["fs", "process"], idempotent: true },
  "git.rebase": { reads: ["fs"], writes: ["fs", "process"], destructive: true, idempotent: true },
  "git.rebase.continue": { reads: ["fs"], writes: ["fs", "process"], destructive: true },
  "git.worktree.add": { reads: ["fs"], writes: ["fs", "process"], destructive: false, idempotent: true },
};

/** The files of a folder, with their content, and the state of its repository. */
function snapshot(): Record<string, string> {
  const result: Record<string, string> = {};
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const key = relative(base, path).split("\\").join("/");
      // A repository counts as one entry: its refs, index and stashes are below
      if (entry.name === ".git") result[key] = "<repository>";
      else if (entry.isDirectory()) visit(path);
      else if (!key.startsWith("origin.git/")) result[key] = readFileSync(path, "utf8");
    }
  };
  visit(base);
  // The refs (refs/stash too), the index, HEAD and the configuration (remotes, upstreams)
  result["#refs"] = git(repo, "for-each-ref", "--format=%(refname) %(objectname)");
  result["#index"] = git(repo, "ls-files", "--stage");
  result["#head"] = readFileSync(join(repo, ".git", "HEAD"), "utf8");
  result["#config"] = readFileSync(join(repo, ".git", "config"), "utf8");
  result["#origin"] = git(origin, "for-each-ref", "--format=%(refname) %(objectname)");
  return result;
}

/**
 * This function makes the state of the effects tests in a copy of the template: a new commit of
 * origin from another clone, a stash, a change of a tracked file and an untracked file.
 */
function prepareEffects(folder: string): void {
  const prepared = join(folder, "repo");
  git(prepared, "remote", "set-url", "origin", join(folder, "origin.git"));
  const other = join(folder, "other");
  git(folder, "clone", "-q", join(folder, "origin.git"), other);
  git(other, "config", "user.name", "Other");
  git(other, "config", "user.email", "other@example.com");
  writeFileSync(join(other, "z.txt"), "from other\n");
  git(other, "add", "z.txt");
  git(other, "commit", "-q", "-m", "from other");
  git(other, "push", "-q", "origin", "main");
  writeFileSync(join(prepared, "s.txt"), "stashed\n");
  git(prepared, "add", "s.txt");
  git(prepared, "stash", "push", "-q", "-m", "kept");
  // R40: a tag, and a branch with one more commit (for merge, rebase and the worktrees)
  git(prepared, "tag", "v0");
  git(prepared, "checkout", "-q", "-b", "topic");
  writeFileSync(join(prepared, "t.txt"), "topic\n");
  git(prepared, "add", "t.txt");
  git(prepared, "commit", "-q", "-m", "topic");
  git(prepared, "checkout", "-q", "main");
  writeFileSync(join(prepared, "a.txt"), "changed\n");
  writeFileSync(join(prepared, "new.txt"), "new\n");
}

/** A clean working tree: the changes and the untracked file of the prepared state go to a stash. */
function cleanTree(): void {
  git(repo, "stash", "push", "-q", "--include-untracked", "-m", "clean");
}

/** A merge or a rebase of main on `clash` that stopped on a conflict in a.txt. */
function stopOnConflict(command: "merge" | "rebase"): void {
  cleanTree();
  git(repo, "checkout", "-q", "-b", "clash");
  writeFileSync(join(repo, "a.txt"), "clash\n");
  git(repo, "commit", "-q", "-am", "clash");
  git(repo, "checkout", "-q", "main");
  writeFileSync(join(repo, "a.txt"), "main\n");
  git(repo, "commit", "-q", "-am", "main");
  expect(() => git(repo, command, "clash")).toThrow();
}

/** The work of each procedure that needs more than the prepared state, before the call. */
function setUp(key: string): void {
  if (key === "git.init") mkdirSync(join(base, "made"));
  if (key === "git.pull" || key === "git.rebase") cleanTree();
  if (key === "git.merge.abort") stopOnConflict("merge");
  if (key === "git.rebase.abort") stopOnConflict("rebase");
  if (key === "git.rebase.continue") {
    stopOnConflict("rebase");
    writeFileSync(join(repo, "a.txt"), "resolved\n");
    git(repo, "add", "a.txt");
  }
  if (key === "git.worktree.remove") git(repo, "worktree", "add", "-q", "--detach", join(base, "wt-remove"));
}

/** An input for each procedure: each one has work to do in the prepared state. */
function effectsInput(key: string): Record<string, unknown> {
  switch (key) {
    case "git.add":
      return { cwd: repo, paths: ["new.txt"] };
    case "git.commit":
      return { cwd: repo, message: "effects", all: true };
    case "git.push":
      return { cwd: repo, branch: "main", force: true };
    case "git.pull":
      return { cwd: repo, rebase: true };
    case "git.clone":
      return { cwd: base, url: origin, dest: "clone" };
    case "git.checkout":
      return { cwd: repo, ref: "HEAD", paths: ["a.txt"] };
    case "git.branch":
      return { cwd: repo, name: "effects" };
    case "git.init":
      return { cwd: join(base, "made") };
    case "git.remote.set":
      return { cwd: repo, name: "mirror", url: "https://example.com/mirror.git" };
    case "git.stash.import":
      return { cwd: repo, patch: git(repo, "stash", "show", "-p", "stash@{0}") };
    case "git.blame":
      return { cwd: repo, path: "a.txt" };
    case "git.tag.add":
      return { cwd: repo, name: "effects" };
    case "git.tag.delete":
      return { cwd: repo, name: "v0" };
    case "git.branch.add":
      return { cwd: repo, name: "effects" };
    case "git.branch.delete":
      return { cwd: repo, name: "topic", force: true };
    case "git.reset":
      return { cwd: repo, mode: "hard" };
    case "git.restore":
      return { cwd: repo, paths: ["a.txt"] };
    case "git.merge":
      return { cwd: repo, ref: "topic" };
    case "git.rebase":
      return { cwd: repo, upstream: "topic" };
    case "git.worktree.add":
      return { cwd: repo, path: join(base, "wt"), ref: "topic" };
    case "git.worktree.remove":
      return { cwd: repo, path: join(base, "wt-remove") };
    default:
      return { cwd: repo };
  }
}

describe("the effects of the git procedures", () => {
  /** The prepared state, made one time from the template. */
  let prepared: string;

  beforeAll(() => {
    prepared = join(repos.shared, "prepared");
    cpSync(join(repos.shared, "template"), prepared, { recursive: true });
    prepareEffects(prepared);
  });

  beforeEach(() => {
    repos.useCopyOf(prepared);
  });

  it("are declared for each procedure of the module", () => {
    const declared = Object.fromEntries(gitModule.procedures.map((procedure) => [procedure.path.join("."), procedure.metadata.effects]));
    expect(declared).toEqual(DECLARED);
  });

  for (const [key, effects] of Object.entries(DECLARED)) {
    const reader = effects.writes?.length === 0;
    it(`${key} ${reader ? "changes nothing" : "changes the repository"}${effects.idempotent ? ", and a second call changes nothing more" : ""}`, async () => {
      setUp(key);
      const path = key.split(".");
      const before = snapshot();
      await call(path, effectsInput(key));
      const after = snapshot();
      if (reader) expect(after).toEqual(before);
      else expect(after).not.toEqual(before);
      if (effects.idempotent) {
        // A second call can fail (the clone folder exists now), but it changes nothing
        await call(path, effectsInput(key)).catch(() => undefined);
        expect(snapshot()).toEqual(after);
      }
    });
  }
});
