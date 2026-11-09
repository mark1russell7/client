/**
 * The state of a repository from its files, with no git process (roadmap CLI-123).
 *
 * A list of many working trees with `git` starts one process or more for each tree. These
 * functions read the same state from the files of the git folder: the `HEAD` files, the folders of
 * `worktrees`, the loose refs and `packed-refs`. They read no objects. A repository with the
 * `reftable` format of refs gets an error.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { GitWorktreeInfo } from "../../types.js";

/** The head of a working tree: its branch, or a detached commit. */
export interface GitHeadInfo {
  /** The commit of the head. A branch with no commit (a new repository) has none. */
  head?: string | undefined;
  /** The branch of the head, with no `refs/heads/` prefix. A detached head has none. */
  branch?: string | undefined;
  detached: boolean;
}

/** The folders of git of a working tree: its own git folder, and the common folder of its repository. */
export interface GitDirs {
  /** The git folder of the tree: `.git` of the main tree, or the folder in `worktrees` of a linked tree. */
  gitDir: string;
  /** The git folder with the refs, the objects and the folder `worktrees`. */
  commonDir: string;
}

/** A full hash of a commit: 40 hex digits (SHA-1) or 64 (SHA-256). */
const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** The most steps of a symbolic ref to its commit. Git stops at 5 too. */
const MAX_SYMREF_DEPTH = 5;

/** This function gives the text of a file, or undefined when the file does not exist. */
async function textOf(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") return undefined;
    throw error;
  }
}

/** True when a path exists. */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * This function gives the git folders of a working tree, of a git folder, or of a bare repository.
 * A linked tree has a file `.git` with the line `gitdir: <path>`. It throws for a folder that is
 * not in git.
 */
export async function gitDirsOf(tree: string): Promise<GitDirs> {
  const dotGit = join(tree, ".git");
  let gitDir: string;
  const link = await textOf(dotGit).catch((error: unknown) => {
    // A folder .git: the main tree
    if ((error as NodeJS.ErrnoException).code === "EISDIR") return null;
    throw error;
  });
  if (link === null) gitDir = resolve(dotGit);
  else if (link !== undefined) {
    const match = /^gitdir: (.+)$/m.exec(link);
    if (match === null) throw new Error(`The file ${dotGit} has no line gitdir`);
    gitDir = resolve(tree, match[1]!.trim());
  } else if (await exists(join(tree, "HEAD"))) {
    // A git folder or a bare repository
    gitDir = resolve(tree);
  } else throw new Error(`The folder ${tree} is not a git working tree`);
  const common = await textOf(join(gitDir, "commondir"));
  return { gitDir, commonDir: common === undefined ? gitDir : resolve(gitDir, common.trim()) };
}

/** This function throws for a repository whose refs are in the reftable format: these functions do not read it. */
async function assertFilesRefs(commonDir: string): Promise<void> {
  if (await exists(join(commonDir, "reftable"))) throw new Error(`The repository ${commonDir} keeps its refs in the reftable format: read them with git`);
}

/** This function reads `packed-refs`: the name and the hash of each ref. A peeled line (`^`) and a comment are not refs. */
function parsePackedRefs(text: string): Map<string, string> {
  const refs = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (line === "" || line.startsWith("#") || line.startsWith("^")) continue;
    const space = line.indexOf(" ");
    if (space < 0) continue;
    const hash = line.slice(0, space).toLowerCase();
    if (HASH.test(hash)) refs.set(line.slice(space + 1).trim(), hash);
  }
  return refs;
}

/** This function adds the loose refs of a folder of refs to `out`: a hash, or `ref: <name>` for a symbolic ref. */
async function readLoose(commonDir: string, folder: string, out: Map<string, string>): Promise<void> {
  let entries;
  try {
    entries = await readdir(join(commonDir, folder), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const name = `${folder}/${entry.name}`;
      if (entry.isDirectory()) return readLoose(commonDir, name, out);
      // A lock file is a write of git that did not end
      if (!entry.isFile() || entry.name.endsWith(".lock")) return;
      const text = (await textOf(join(commonDir, name)))?.trim();
      if (text !== undefined && text !== "") out.set(name, text);
    }),
  );
}

/** This function gives the hash of a value of a ref: a hash, or a symbolic ref that it follows in `refs`. */
function hashOf(value: string, refs: ReadonlyMap<string, string>): string | undefined {
  let current: string | undefined = value;
  for (let depth = 0; current !== undefined && depth <= MAX_SYMREF_DEPTH; depth++) {
    const lower = current.toLowerCase();
    if (HASH.test(lower)) return lower;
    if (!current.startsWith("ref: ")) return undefined;
    current = refs.get(current.slice(5).trim());
  }
  return undefined;
}

/**
 * This function reads the refs of a repository from its files: the loose refs under `refs/` and the
 * lines of `packed-refs`. A loose ref takes the place of its packed line, as in git. A symbolic ref
 * gives the hash of its target. A symbolic ref to a missing ref is not in the result. The map goes
 * from each full name (`refs/heads/main`, `refs/remotes/origin/main`) to its hash. The repository
 * is any working tree of it, or its git folder.
 */
export async function readRefs(repo: string): Promise<Map<string, string>> {
  const { commonDir } = await gitDirsOf(repo);
  return refsOf(commonDir);
}

/** This function reads the refs of a common git folder. */
async function refsOf(commonDir: string): Promise<Map<string, string>> {
  await assertFilesRefs(commonDir);
  const packed = await textOf(join(commonDir, "packed-refs"));
  const values = new Map<string, string>(packed === undefined ? [] : parsePackedRefs(packed));
  const loose = new Map<string, string>();
  await readLoose(commonDir, "refs", loose);
  for (const [name, value] of loose) values.set(name, value);
  const refs = new Map<string, string>();
  for (const name of [...values.keys()].sort()) {
    const hash = hashOf(values.get(name)!, values);
    if (hash !== undefined) refs.set(name, hash);
  }
  return refs;
}

/** This function gives the head of the HEAD file of a git folder, with the hashes of `refs`. */
async function headOf(gitDir: string, refs: () => Promise<ReadonlyMap<string, string>>): Promise<GitHeadInfo> {
  const text = (await textOf(join(gitDir, "HEAD")))?.trim();
  if (text === undefined) throw new Error(`The git folder ${gitDir} has no HEAD file`);
  if (text.startsWith("ref: ")) {
    const ref = text.slice(5).trim();
    const head = (await refs()).get(ref);
    const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    return { ...(head !== undefined && { head }), branch, detached: false };
  }
  const head = text.toLowerCase();
  if (!HASH.test(head)) throw new Error(`The HEAD file of ${gitDir} holds no hash and no ref`);
  return { head, detached: true };
}

/**
 * This function reads the head of a working tree from its files: the branch and its commit, or a
 * detached commit. A linked tree reads its HEAD through its file `.git`. A branch with no commit
 * gives the branch with no `head`.
 */
export async function readHead(tree: string): Promise<GitHeadInfo> {
  const { gitDir, commonDir } = await gitDirsOf(tree);
  return headOf(gitDir, () => refsOf(commonDir));
}

/**
 * This function reads the working trees of a repository from its files, as `git worktree list`
 * gives them. The main tree is first. Then each linked tree follows, by the name of its folder in
 * `worktrees`. The repository is any working tree of it, or its git folder.
 *
 * A linked tree whose folder is gone is `prunable`. A tree with a file `locked` is `locked`. The
 * function reads the refs one time for all trees. A common folder with the name `.git` gives a main
 * tree. Another name gives a bare main entry.
 */
export async function readWorktrees(main: string): Promise<GitWorktreeInfo[]> {
  const { commonDir } = await gitDirsOf(main);
  let cached: Promise<Map<string, string>> | undefined;
  const refs = () => (cached ??= refsOf(commonDir));
  const bare = basename(commonDir) !== ".git";
  const mainTree: GitWorktreeInfo = bare
    ? { path: commonDir, detached: false, bare: true, locked: false, prunable: false }
    : { path: dirname(commonDir), ...(await headOf(commonDir, refs)), bare: false, locked: false, prunable: false };
  let names: string[];
  try {
    names = (await readdir(join(commonDir, "worktrees"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    names = [];
  }
  const linked = await Promise.all(
    names.sort().map(async (name): Promise<GitWorktreeInfo | undefined> => {
      const dir = join(commonDir, "worktrees", name);
      const gitdir = (await textOf(join(dir, "gitdir")))?.trim();
      // A folder of worktrees with no gitdir file is not a linked tree
      if (gitdir === undefined || gitdir === "") return undefined;
      const dotGit = resolve(dir, gitdir);
      const path = dirname(dotGit);
      const [head, locked, present] = await Promise.all([headOf(dir, refs), exists(join(dir, "locked")), exists(dotGit)]);
      return { path, ...head, bare: false, locked, prunable: !present };
    }),
  );
  return [mainTree, ...linked.filter((tree): tree is GitWorktreeInfo => tree !== undefined)];
}

/**
 * This function tells if a remote-tracking ref (`refs/remotes/*`) of the repository points at
 * the commit `sha` exactly. It gives true, else "unknown": the commit can be in the history of a
 * remote ref, and this function reads no objects. The `sha` is a full hash.
 */
export async function onRemote(repo: string, sha: string): Promise<true | "unknown"> {
  const hash = sha.trim().toLowerCase();
  if (!HASH.test(hash)) return "unknown";
  for (const [name, value] of await readRefs(repo)) if (name.startsWith("refs/remotes/") && value === hash) return true;
  return "unknown";
}
