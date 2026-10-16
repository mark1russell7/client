# @procedures/git

[![npm version](https://img.shields.io/npm/v/@procedures/git.svg)](https://www.npmjs.com/package/@procedures/git)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Git operations as RPC procedures - `git.add`, `git.commit`, `git.push`, `git.status`, and 41 more git commands exposed as type-safe procedures.

## Overview

`@procedures/git` exposes comprehensive Git functionality as RPC procedures through the client system. It provides 45 procedures covering all major Git operations including repository state management, staging, commits, branching, tags, merges, rebases, working trees, remote operations, stashing, and repository predicates.

The package starts git with `runCommand` of `@procedures/shell`: an argument list, no shell. Each call is async, and its signal stops git. Zod schemas validate the input and the output.

## Architecture

```mermaid
graph TB
    A[client-git] -->|depends on| B[@procedures/client]
    A -->|validates with| C[zod]

    D[Application] -->|calls| E[git.* procedures]
    E -->|executes| F[Git CLI]
    E -->|parses| G[Structured Output]

    H[Repository State<br/>status, log, diff, branch] -.-> E
    I[Staging & Commits<br/>add, commit, checkout] -.-> E
    J[Remote Sync<br/>push, pull, fetch, clone] -.-> E
    K[Stash Operations<br/>stash.*, export, import] -.-> E
    L[Predicates<br/>hasChanges, isClean, etc] -.-> E

    style A fill:#e1f5ff
    style E fill:#e1ffe1
```

### Procedure Categories

```mermaid
graph LR
    A[client-git<br/>45 Procedures] --> B[Repository State<br/>5 procedures]
    A --> C[Staging & Commits<br/>3 procedures]
    A --> D[Remote Operations<br/>5 procedures]
    A --> E[Predicates<br/>6 procedures]
    A --> F[Stash Operations<br/>7 procedures]
    A --> G[History, Tags, Merge, Rebase,<br/>Working Trees, Branches<br/>19 procedures]

    B -.-> B1[status, log, diff,<br/>branch, init]
    C -.-> C1[add, commit,<br/>checkout]
    D -.-> D1[push, pull, fetch,<br/>clone, remote]
    E -.-> E1[hasChanges, isClean,<br/>hasStagedChanges,<br/>hasUnstagedChanges,<br/>hasUntrackedFiles,<br/>hasLocalCommits]
    F -.-> F1[stash.list, stash.push,<br/>stash.pop, stash.apply,<br/>stash.drop, stash.export,<br/>stash.import]

    style A fill:#e1f5ff
    style B fill:#ffe1e1
    style C fill:#ffe1e1
    style D fill:#ffe1e1
    style E fill:#fff4e1
    style F fill:#e1ffe1
```

## Installation

```bash
# Using pnpm (recommended)
pnpm add @procedures/git

# Using npm
npm install @procedures/git

# Using yarn
yarn add @procedures/git
```

## Quick Start

```typescript
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@procedures/client";
import "@procedures/git/register"; // registers its procedures

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

// Get repository status
const status = await client.exec(["git", "status"], {
  cwd: "/path/to/repo",
});
console.log(status.branch, status.files);

// Stage and commit
await client.exec(["git", "add"], { all: true });
await client.exec(["git", "commit"], { message: "feat: add new feature" });

// Push to remote
await client.exec(["git", "push"], { remote: "origin" });
```

## API Reference

### Repository State Procedures

#### `git.status`

Get current repository status including branch, tracking info, and file changes.

**Path:** `["git", "status"]`

```typescript
interface GitStatusInput {
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Also give `lines` in the format of `git status --short` (default: false) */
  short?: boolean;
  /** Only the files of these pathspecs (`git status -- <paths>`) */
  paths?: string[];
  /** `--untracked-files`: "no", "normal" (a new folder is one entry) or "all" (each file) */
  untrackedFiles?: "no" | "normal" | "all";
}

interface GitStatusFile {
  /** The path (for a rename or a copy, the new path). Paths are exact: no quotes. */
  path: string;
  /** For a rename or a copy, the old path */
  from?: string;
  status: "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked" | "ignored";
  staged: boolean;
}

interface GitStatusOutput {
  branch: string;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
  clean: boolean;
  /** With `short: true`: one line per file, for example "R  old.ts -> new.ts" */
  lines?: string[];
}
```

**Example:**
```typescript
const status = await client.exec(["git", "status"], { cwd: "./my-repo" });
console.log(`On branch ${status.branch}`);
console.log(`${status.ahead} commits ahead, ${status.behind} behind`);
console.log(`${status.files.length} changed files`);

// Each new file under notes/, one entry for each file
const notes = await client.exec(["git", "status"], { cwd: "./my-repo", paths: ["notes"], untrackedFiles: "all" });
```

- Without `paths` and `untrackedFiles`, the procedure starts the same git command as before.
- After `--`, git reads each path as a pathspec. A path that starts with `-` is not an option.
- Without `untrackedFiles: "all"`, git gives a new folder as one entry, for example `notes/`.

#### `git.log`

Show commit history.

**Path:** `["git", "log"]`

```typescript
interface GitLogInput {
  /** Number of commits to show (default: 10) */
  count?: number;
  /** Also give `lines`: one line per commit, the short hash and the subject (default: false) */
  oneline?: boolean;
  /** Branch/tag/commit to start from (default: HEAD) */
  ref?: string;
  /** Working directory */
  cwd?: string;
}

interface GitLogCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

interface GitLogOutput {
  commits: GitLogCommit[];
  /** With `oneline: true` */
  lines?: string[];
}
```

**Example:**
```typescript
const log = await client.exec(["git", "log"], { count: 5 });
for (const commit of log.commits) {
  console.log(`${commit.shortHash} - ${commit.message}`);
}
```

#### `git.diff`

Show changes between commits, branches, or working directory.

**Path:** `["git", "diff"]`

```typescript
interface GitDiffInput {
  /** Show staged changes (default: false, shows unstaged) */
  staged?: boolean;
  /** Compare against ref (branch/commit) */
  ref?: string;
  /** Specific paths to diff */
  paths?: string[];
  /** Show stat summary only (default: false) */
  stat?: boolean;
  /** Working directory */
  cwd?: string;
}

interface GitDiffFile {
  /** The path (for a rename, the new path) */
  path: string;
  /** For a rename, the old path */
  from?: string;
  additions: number;
  deletions: number;
}

interface GitDiffOutput {
  files: GitDiffFile[];
  additions: number;
  deletions: number;
  diff?: string;
}
```

**Example:**
```typescript
// Show unstaged changes
const diff = await client.exec(["git", "diff"], { stat: true });
console.log(`${diff.additions} additions, ${diff.deletions} deletions`);

// Show staged changes
const staged = await client.exec(["git", "diff"], { staged: true });
```

#### `git.branch` (deprecated)

Branch operations - list, create, delete branches.

This procedure is deprecated since roadmap R40. Use `git.branch.list`, `git.branch.add` and `git.branch.delete`. It stays for one release, and it calls the code of the three new procedures. Its metadata has `deprecated: true`.

**Path:** `["git", "branch"]`

```typescript
interface GitBranchInput {
  /** Branch name (for create/delete) */
  name?: string;
  /** Delete the branch (default: false) */
  delete?: boolean;
  /** List branches (default: true if no name provided) */
  list?: boolean;
  /** Include remote branches in list (default: false) */
  remote?: boolean;
  /** Working directory */
  cwd?: string;
}

interface GitBranchInfo {
  name: string;
  current: boolean;
  remote: boolean;
  tracking?: string;
}

interface GitBranchOutput {
  branches?: GitBranchInfo[];
  created?: string;
  deleted?: string;
  current: string;
}
```

**Example:**
```typescript
// List all branches
const branches = await client.exec(["git", "branch"], { list: true });
console.log("Branches:", branches.branches.map(b => b.name));

// Create new branch
await client.exec(["git", "branch"], { name: "feature/new-feature" });

// Delete branch
await client.exec(["git", "branch"], { name: "old-feature", delete: true });
```

#### `git.init`

Initialize a new git repository.

**Path:** `["git", "init"]`

```typescript
interface GitInitInput {
  /** Directory to initialize (default: process.cwd()) */
  cwd?: string;
  /** Create a bare repository (default: false) */
  bare?: boolean;
  /** Name for the initial branch */
  initialBranch?: string;
}

interface GitInitOutput {
  /** The initialized repository path */
  path: string;
  /** Whether the repo was newly created */
  created: boolean;
}
```

### Staging & Commit Procedures

#### `git.add`

Stage files for commit.

**Path:** `["git", "add"]`

```typescript
interface GitAddInput {
  /** Paths to stage (default: []) */
  paths?: string[];
  /** Stage all changes (default: false) */
  all?: boolean;
  /** Working directory */
  cwd?: string;
}

interface GitAddOutput {
  staged: string[];
}
```

**Example:**
```typescript
// Stage specific files
await client.exec(["git", "add"], { paths: ["file1.ts", "file2.ts"] });

// Stage all changes
await client.exec(["git", "add"], { all: true });
```

#### `git.commit`

Create a commit with staged changes.

**Path:** `["git", "commit"]`

```typescript
interface GitCommitInput {
  /** Commit message */
  message: string;
  /** Automatically stage modified files (default: false) */
  all?: boolean;
  /** Amend the last commit (default: false) */
  amend?: boolean;
  /** Commit only these pathspecs, as they are in the working tree (`git commit -- <paths>`) */
  paths?: string[];
  /** Working directory */
  cwd?: string;
}

interface GitCommitOutput {
  hash: string;
  message: string;
  author: string;
  date: string;
  /** True if commit was skipped (nothing to commit) */
  skipped?: boolean;
}
```

**Example:**
```typescript
const commit = await client.exec(["git", "commit"], {
  message: "feat: add new feature\n\nDetailed description here",
  all: true, // Auto-stage modified files
});
console.log(`Created commit ${commit.hash}`);
```

With `paths`, the commit has only those paths, as they are in the working tree. The other staged changes stay in the index:

```typescript
await client.exec(["git", "add"], { paths: ["ledger/new.ndjson"] });
await client.exec(["git", "commit"], { message: "ledger: the day", paths: ["ledger"] });
```

- With `paths`, a change of a tracked file counts, staged or not. When no tracked file of the paths changed, the output has `skipped: true`.
- git does not commit an untracked file. Add a new file with `git.add` first.
- git refuses `-a` with paths. Thus `all` and `paths` together give an error.

#### `git.checkout`

Checkout branch, tag, or restore files.

**Path:** `["git", "checkout"]`

```typescript
interface GitCheckoutInput {
  /** Branch, tag, or commit to checkout */
  ref: string;
  /** Create branch if it doesn't exist (default: false) */
  create?: boolean;
  /** Specific paths to checkout (default: all) */
  paths?: string[];
  /** Working directory */
  cwd?: string;
}

interface GitCheckoutOutput {
  ref: string;
  created: boolean;
}
```

**Example:**
```typescript
// Checkout existing branch
await client.exec(["git", "checkout"], { ref: "main" });

// Create and checkout new branch
await client.exec(["git", "checkout"], { ref: "feature/new", create: true });

// Restore specific file
await client.exec(["git", "checkout"], { ref: "HEAD", paths: ["file.ts"] });
```

### Remote Operations

#### `git.push`

Push commits to remote repository.

**Path:** `["git", "push"]`

```typescript
interface GitPushInput {
  /** Remote name (default: origin) */
  remote?: string;
  /** Branch to push (default: current branch) */
  branch?: string;
  /** Force push (default: false) */
  force?: boolean;
  /** Set upstream tracking (default: false) */
  setUpstream?: boolean;
  /** Working directory */
  cwd?: string;
}

interface GitPushOutput {
  remote: string;
  branch: string;
  commits: number;
}
```

**Example:**
```typescript
// Push to origin
await client.exec(["git", "push"], {});

// Push and set upstream
await client.exec(["git", "push"], {
  remote: "origin",
  branch: "feature/new",
  setUpstream: true,
});

// Force push (use with caution!)
await client.exec(["git", "push"], { force: true });
```

#### `git.pull`

Pull changes from remote repository.

**Path:** `["git", "pull"]`

```typescript
interface GitPullInput {
  /** Remote name (default: origin) */
  remote?: string;
  /** Branch to pull (default: current branch) */
  branch?: string;
  /** Rebase instead of merge (default: false) */
  rebase?: boolean;
  /** Working directory */
  cwd?: string;
}

interface GitPullOutput {
  remote: string;
  branch: string;
  commits: number;
  fastForward: boolean;
}
```

#### `git.fetch`

Fetch from remote without merging.

**Path:** `["git", "fetch"]`

```typescript
interface GitFetchInput {
  /** Remote name (default: origin) */
  remote?: string;
  /** Specific branch to fetch (default: all) */
  branch?: string;
  /** Fetch all remotes (default: false) */
  all?: boolean;
  /** Prune deleted branches (default: false) */
  prune?: boolean;
  /** Working directory */
  cwd?: string;
}

interface GitFetchOutput {
  remote: string;
  fetched: boolean;
}
```

#### `git.clone`

Clone a repository.

**Path:** `["git", "clone"]`

```typescript
interface GitCloneInput {
  /** Repository URL */
  url: string;
  /** Destination directory (default: derived from URL) */
  dest?: string;
  /** Branch to clone (default: default branch) */
  branch?: string;
  /** Create shallow clone with depth (default: full clone) */
  depth?: number;
  /** Working directory */
  cwd?: string;
}

interface GitCloneOutput {
  path: string;
  branch: string;
}
```

**Example:**
```typescript
const clone = await client.exec(["git", "clone"], {
  url: "https://github.com/user/repo.git",
  dest: "./my-repo",
  depth: 1, // Shallow clone
});
console.log(`Cloned to ${clone.path}`);
```

#### `git.remote`

Get the URL of a remote. It changes nothing.

**Path:** `["git", "remote"]`

```typescript
interface GitRemoteInput {
  /** Remote name (default: origin) */
  name?: string;
  /** Working directory */
  cwd?: string;
}

interface GitRemoteOutput {
  /** Remote name */
  name: string;
  /** Remote URL */
  url: string;
}
```

#### `git.remote.set`

Set the URL of a remote, or add the remote when it is missing. Before 0.2.0, `git.remote` with `url` did this.

**Path:** `["git", "remote", "set"]`

```typescript
interface GitRemoteSetInput {
  /** Remote name (default: origin) */
  name?: string;
  /** The URL of the remote */
  url: string;
  /** Working directory */
  cwd?: string;
}
```

### Predicate Procedures

These procedures return boolean predicates useful for conditional logic.

#### `git.hasChanges`

Check if there are any changes (unstaged, staged, or untracked).

**Path:** `["git", "hasChanges"]`

```typescript
interface GitPredicateInput {
  cwd?: string;
}

interface GitPredicateOutput {
  value: boolean;
}
```

#### `git.hasStagedChanges`

Check if there are staged changes ready to commit.

**Path:** `["git", "hasStagedChanges"]`

#### `git.hasUnstagedChanges`

Check if there are unstaged changes.

**Path:** `["git", "hasUnstagedChanges"]`

#### `git.hasUntrackedFiles`

Check if there are untracked files.

**Path:** `["git", "hasUntrackedFiles"]`

#### `git.hasLocalCommits`

Check if there are local commits that haven't been pushed.

**Path:** `["git", "hasLocalCommits"]`

#### `git.isClean`

Check if the working directory is clean (no changes).

**Path:** `["git", "isClean"]`

**Example:**
```typescript
const { value: hasChanges } = await client.exec(["git", "hasChanges"], {});
if (hasChanges) {
  console.log("Repository has uncommitted changes");
}

const { value: isClean } = await client.exec(["git", "isClean"], {});
if (isClean) {
  console.log("Working directory is clean");
}
```

### Stash Procedures

#### `git.stash.list`

List all stashes.

**Path:** `["git", "stash", "list"]`

```typescript
interface GitStashEntry {
  /** Stash index (0 = most recent) */
  index: number;
  /** Stash reference (e.g., stash@{0}) */
  ref: string;
  /** Commit hash of the stash */
  hash: string;
  /** Stash message */
  message: string;
}

interface GitStashListOutput {
  /** List of stashes */
  stashes: GitStashEntry[];
  /** Total count */
  count: number;
}
```

#### `git.stash.push`

Save changes to stash.

**Path:** `["git", "stash", "push"]`

```typescript
interface GitStashPushInput {
  /** Stash message */
  message?: string;
  /** Include untracked files (default: false) */
  includeUntracked?: boolean;
  /** Keep staged changes in index (default: false) */
  keepIndex?: boolean;
  /** Specific paths to stash */
  paths?: string[];
  /** Working directory */
  cwd?: string;
}

interface GitStashPushOutput {
  /** Whether changes were stashed */
  stashed: boolean;
  /** Stash reference if created */
  ref?: string;
  /** Stash message */
  message?: string;
}
```

#### `git.stash.pop`

Apply and remove most recent stash.

**Path:** `["git", "stash", "pop"]`

```typescript
interface GitStashPopInput {
  /** Stash index to pop (default: 0 = most recent) */
  index?: number;
  cwd?: string;
}

interface GitStashPopOutput {
  /** Whether stash was applied */
  applied: boolean;
  /** Stash reference that was popped */
  ref: string;
  /** Whether stash was dropped (false if conflict) */
  dropped: boolean;
  /** Whether there was a merge conflict */
  conflict?: boolean;
}
```

#### `git.stash.apply`

Apply stash without removing it.

**Path:** `["git", "stash", "apply"]`

```typescript
interface GitStashApplyInput {
  /** Stash index to apply (default: 0 = most recent) */
  index?: number;
  cwd?: string;
}

interface GitStashApplyOutput {
  /** Whether stash was applied */
  applied: boolean;
  /** Stash reference that was applied */
  ref: string;
  /** Whether there was a merge conflict */
  conflict?: boolean;
}
```

#### `git.stash.drop`

Delete a stash.

**Path:** `["git", "stash", "drop"]`

```typescript
interface GitStashDropInput {
  /** Stash index to drop (default: 0 = most recent) */
  index?: number;
  cwd?: string;
}

interface GitStashDropOutput {
  /** Whether stash was dropped */
  dropped: boolean;
  /** Stash reference that was dropped */
  ref: string;
}
```

#### `git.stash.export`

Export stash as patch for snapshot storage.

**Path:** `["git", "stash", "export"]`

```typescript
interface GitStashExportInput {
  /** Stash index to export (default: 0 = most recent) */
  index?: number;
  cwd?: string;
}

interface GitStashExportOutput {
  /** Stash reference */
  ref: string;
  /** Commit hash */
  hash: string;
  /** Stash message */
  message: string;
  /** Patch content (diff) */
  patch: string;
  /** Whether stash includes untracked files */
  hasUntracked: boolean;
  /** Untracked files patch if present */
  untrackedPatch?: string;
}
```

#### `git.stash.import`

Import stash from patch.

**Path:** `["git", "stash", "import"]`

```typescript
interface GitStashImportInput {
  /** Patch content to apply and stash */
  patch: string;
  /** Message for the new stash */
  message?: string;
  /** Include untracked files (default: false) */
  includeUntracked?: boolean;
  cwd?: string;
}

interface GitStashImportOutput {
  /** Whether import succeeded */
  imported: boolean;
  /** New stash reference if created */
  ref?: string;
  /** Error message if failed */
  error?: string;
}
```

**Stash Example:**
```typescript
// Save current work
await client.exec(["git", "stash", "push"], {
  message: "WIP: feature in progress",
  includeUntracked: true,
});

// List stashes
const stashes = await client.exec(["git", "stash", "list"], {});
console.log(`${stashes.count} stashes`);

// Apply most recent stash
await client.exec(["git", "stash", "apply"], { index: 0 });

// Export stash for backup
const exported = await client.exec(["git", "stash", "export"], { index: 0 });
fs.writeFileSync("backup.patch", exported.patch);
```

### History, tags, merges, rebases and working trees (roadmap R40)

Each procedure takes `cwd`, the folder of the repository. A value that starts with `-` is not an option: a ref or a name is refused, and a path stays a path after `--`. The effects column shows `metadata.effects`. "process" means that git starts the hooks of the repository, which are code of the project.

| Procedure | Input | Output | Effects |
|---|---|---|---|
| `git.show` | `ref` (default `HEAD`), `path`, `stat` | Without `path`: `hash`, `author`, `email`, `date`, `message`, `body`, `files`, `diff`. With `path`: `content` | reads |
| `git.blame` | `path`, `ref`, `startLine`, `endLine` | `lines`: `line`, `hash`, `author`, `email`, `date`, `summary`, `content` | reads |
| `git.tag.list` | `pattern` | `tags`: `name`, `hash` (the commit), `annotated`, `message` | reads |
| `git.tag.add` | `name`, `ref`, `message` | `name`, `hash`, `annotated` | writes, not destructive, idempotent |
| `git.tag.delete` | `name` | `name`, `hash` (the object of the tag) | writes, destructive, idempotent |
| `git.revParse` | `ref` (default `HEAD`), `abbrevRef`, `short` | `ref`, `value` | reads |
| `git.reset` | `ref` (default `HEAD`), `mode` (`soft`, `mixed`, `hard`, `merge`, `keep`), `paths` | `ref`, `mode`, `hash` | writes, destructive |
| `git.restore` | `paths`, `source`, `staged`, `worktree` | `restored` | writes, process, destructive, idempotent |
| `git.merge` | `ref`, `fastForward` (`auto`, `only`, `never`), `message` | `hash`, `fastForward`, `upToDate`, `conflict`, `conflicts` | writes, process, idempotent |
| `git.merge.abort` | none | `aborted`, `hash` | writes, destructive, idempotent |
| `git.rebase` | `upstream`, `onto`, `branch` | `hash`, `completed`, `upToDate`, `conflict`, `conflicts` | writes, process, destructive, idempotent |
| `git.rebase.continue` | none | the output of `git.rebase` | writes, process, destructive |
| `git.rebase.abort` | none | `aborted`, `hash` | writes, destructive, idempotent |
| `git.worktree.list` | none | `worktrees`: `path`, `head`, `branch`, `detached`, `bare`, `locked`, `prunable` | reads |
| `git.worktree.add` | `path`, `ref`, `branch`, `detach` | `path`, `head`, `branch` | writes, process, not destructive, idempotent |
| `git.worktree.remove` | `path`, `force` | `path` | writes, destructive, idempotent |
| `git.branch.list` | `remote` | `branches`, `current` | reads |
| `git.branch.add` | `name`, `startPoint` | `name`, `hash` | writes, not destructive, idempotent |
| `git.branch.delete` | `name`, `force` | `name`, `hash` (the last commit) | writes, destructive, idempotent |

- A merge or a rebase that stops on conflicts is a result, not an error. Then `conflict` is `true`, and `conflicts` names the files.
- After the conflicts of a merge, resolve them and call `git.commit`, or call `git.merge.abort`.
- After the conflicts of a rebase, resolve them, stage them with `git.add`, and call `git.rebase.continue`. Or call `git.rebase.abort`.
- A merge and a rebase never start an editor. The rebase is never interactive.
- `git.tag.add` and `git.branch.add` never move a ref. An existing tag or branch is an error.
- `git.branch.delete` and `git.tag.delete` give the deleted hash. `git.branch.add` with it makes the branch again.
- `git.branch.list` works in a repository without commits. Then `branches` is empty and `current` is the branch that `HEAD` names.

```typescript
const merge = await client.exec(["git", "merge"], { ref: "feature", cwd: "./repo" });
if (merge.conflict) {
  console.log("Conflicts in", merge.conflicts);
  await client.exec(["git", "merge", "abort"], { cwd: "./repo" });
}

const { lines } = await client.exec(["git", "blame"], { path: "src/index.ts", startLine: 1, endLine: 10 });
const { value: branch } = await client.exec(["git", "revParse"], { abbrevRef: true });
```

## Complete Procedure List

| Category | Procedure | Description |
|----------|-----------|-------------|
| **Repository State** | `git.status` | Get repository status |
| | `git.log` | Show commit history |
| | `git.diff` | Show changes |
| | `git.show` | Show a commit, or a file at a commit |
| | `git.blame` | Show the commit and the author of each line |
| | `git.revParse` | Give the hash or the name of a ref |
| | `git.branch` | Branch operations (deprecated) |
| | `git.init` | Initialize repository |
| **Branches and Tags** | `git.branch.list` | List the branches |
| | `git.branch.add` | Make a branch |
| | `git.branch.delete` | Delete a branch |
| | `git.tag.list` | List the tags |
| | `git.tag.add` | Make a tag |
| | `git.tag.delete` | Delete a tag |
| **Merge and Rebase** | `git.merge` | Merge into the current branch |
| | `git.merge.abort` | Stop a merge with conflicts |
| | `git.rebase` | Rebase the current branch |
| | `git.rebase.continue` | Continue a rebase |
| | `git.rebase.abort` | Stop a rebase |
| **Working Trees** | `git.worktree.list` | List the working trees |
| | `git.worktree.add` | Add a working tree |
| | `git.worktree.remove` | Remove a working tree |
| **Undo** | `git.reset` | Move `HEAD`, reset the index or the working tree |
| | `git.restore` | Restore files |
| **Staging & Commits** | `git.add` | Stage files |
| | `git.commit` | Create commit |
| | `git.checkout` | Checkout branch/files |
| **Remote Operations** | `git.push` | Push to remote |
| | `git.pull` | Pull from remote |
| | `git.fetch` | Fetch from remote |
| | `git.clone` | Clone repository |
| | `git.remote` | Get the URL of a remote |
| | `git.remote.set` | Set the URL of a remote |
| **Predicates** | `git.hasChanges` | Check for any changes |
| | `git.hasStagedChanges` | Check for staged changes |
| | `git.hasUnstagedChanges` | Check for unstaged changes |
| | `git.hasUntrackedFiles` | Check for untracked files |
| | `git.hasLocalCommits` | Check for unpushed commits |
| | `git.isClean` | Check if working dir is clean |
| **Stash** | `git.stash.list` | List stashes |
| | `git.stash.push` | Save to stash |
| | `git.stash.pop` | Apply and remove stash |
| | `git.stash.apply` | Apply stash |
| | `git.stash.drop` | Delete stash |
| | `git.stash.export` | Export stash as patch |
| | `git.stash.import` | Import stash from patch |

## Usage Examples

### Complete Git Workflow

```typescript
// 1. Check status
const status = await client.exec(["git", "status"], {});
console.log(`On branch ${status.branch}`);

// 2. Stage changes
await client.exec(["git", "add"], { all: true });

// 3. Create commit
const commit = await client.exec(["git", "commit"], {
  message: "feat: implement new feature",
});

// 4. Push to remote
await client.exec(["git", "push"], {
  remote: "origin",
  setUpstream: true,
});
```

### Conditional Operations with Predicates

```typescript
const { value: hasChanges } = await client.exec(["git", "hasChanges"], {});
if (hasChanges) {
  await client.exec(["git", "stash", "push"], {
    message: "Auto-stash before pull",
  });
}

await client.exec(["git", "pull"], { rebase: true });

const { value: hasStashes } = await client.exec(["git", "stash", "list"], {});
if (hasStashes.count > 0) {
  await client.exec(["git", "stash", "pop"], {});
}
```

### Branch Management

```typescript
// Create feature branch
await client.exec(["git", "checkout"], {
  ref: "feature/new-feature",
  create: true,
});

// Work on feature...
await client.exec(["git", "add"], { all: true });
await client.exec(["git", "commit"], { message: "feat: complete feature" });

// Merge to main
await client.exec(["git", "checkout"], { ref: "main" });
await client.exec(["git", "pull"], {});

// Merge it, then delete the feature branch
await client.exec(["git", "merge"], { ref: "feature/new-feature" });
await client.exec(["git", "branch", "delete"], { name: "feature/new-feature" });
```

### Working with Remotes

```typescript
// Clone repository
const clone = await client.exec(["git", "clone"], {
  url: "https://github.com/user/repo.git",
  dest: "./my-repo",
});

// Set remote
await client.exec(["git", "remote", "set"], {
  name: "upstream",
  url: "https://github.com/original/repo.git",
});

// Fetch from upstream
await client.exec(["git", "fetch"], {
  remote: "upstream",
  prune: true,
});
```

## Dependencies

```mermaid
graph LR
    A[@procedures/git] --> B[@procedures/client]
    A --> C[zod]

    B -.->|provides| D[Client & Procedure System]
    C -.->|provides| E[Schema Validation]

    style A fill:#e1f5ff
    style B fill:#ffe1e1
    style C fill:#fff4e1
```

- **`@procedures/client`** - Core client library providing the procedure system
- **`zod`** - Schema validation library

## Integration with Ecosystem

### Used By

```typescript
// bundle-dev/src/register.ts
import "@procedures/git/register"; // registers its procedures

// client-lib uses git procedures internally
import { gitStatus, gitAdd, gitCommit } from "@procedures/git";
```

### Usage in client-lib

The `client-lib` package uses git procedures extensively for package management:

```typescript
// From client-lib/src/git/operations.ts
export async function stageAll(cwd: string, ctx: ProcedureContext): Promise<void> {
  await ctx.client.call(["git", "add"], { all: true, cwd });
}

export async function commit(
  message: string,
  cwd: string,
  ctx: ProcedureContext
): Promise<string> {
  const result = await ctx.client.call(["git", "commit"], { message, cwd });
  return result.hash;
}
```

## Configuration

### Auto-Registration

Procedures are automatically registered when the package is loaded:

```json
{
  "client": {
    "procedures": "./dist/register.js"
  },
  "scripts": {
    "postinstall": "client-registry announce"
  }
}
```

### Build Scripts

```bash
# Build the package
pnpm build

# Type check
pnpm typecheck

# Clean build artifacts
pnpm clean
```

## Advanced Usage

### Direct Function Imports

The handlers start git themselves. Their context is optional: it gives only the abort `signal`.

```typescript
import { gitStatus, gitCommit, gitPush } from "@procedures/git";

const status = await gitStatus({ cwd: "./repo" });
await gitCommit({ message: "feat: new feature", cwd: "./repo" });
await gitPush({ remote: "origin", cwd: "./repo" }, { signal: AbortSignal.timeout(60_000) });
```

### The git runner and the porcelain parser

The package root also exports the functions that the procedures use:

- `git(args, { cwd, signal, input, env })` starts git with an argument list and gives its stdout. It throws a `GitError` when git fails.
- `parsePorcelainV1(output)` reads the output of `git status --porcelain=v1 -z`.
- Each entry has `xy` (the two status letters), the exact `path`, `status` and `staged`. A rename or a copy also has `from`.
- `classifyStatus(xy)` gives the `status` and `staged` of two status letters.

```typescript
import { git, parsePorcelainV1 } from "@procedures/git";

const output = await git(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "ledger"], { cwd: "./repo" });
const untracked = parsePorcelainV1(output).filter((entry) => entry.status === "untracked");
```

### Custom Registration

```typescript
import { createProcedure, registerProcedures } from "@procedures/client";
import { gitStatus, GitStatusInputSchema } from "@procedures/git";

// Register under custom namespace
const customStatusProcedure = createProcedure()
  .path(["custom", "git", "status"])
  .input(GitStatusInputSchema)
  .handler(gitStatus)
  .build();

registerProcedures([customStatusProcedure]);
```

## Error Handling

All git procedures may throw errors for invalid operations:

```typescript
try {
  await client.exec(["git", "commit"], {
    message: "feat: new feature",
  });
} catch (error) {
  if (error.message.includes("nothing to commit")) {
    console.log("No changes to commit");
  } else {
    throw error;
  }
}
```

## Performance Considerations

- **Command Execution**: Each procedure spawns a git process
- **Large Repositories**: Operations may be slower on repos with extensive history
- **Batch Operations**: Use predicate checks to avoid unnecessary operations
- **Stash Export/Import**: Useful for snapshotting state without git history overhead

## Troubleshooting

### Git Not Found

Ensure git is installed and in PATH:
```bash
git --version
```

### Permission Errors

Check repository permissions:
```bash
ls -la .git
```

### Detached HEAD State

Use `git.checkout` to return to a branch:
```typescript
await client.exec(["git", "checkout"], { ref: "main" });
```

## License

MIT

## Related Packages

- [@procedures/client](https://github.com/mark1russell7/client) - Core client library
- [@procedures/lib](https://github.com/mark1russell7/client-lib) - Library management (uses git procedures)
- [@procedures/pnpm](https://github.com/mark1russell7/client-pnpm) - PNPM wrapper
- [@procedures/bundle-dev](https://github.com/mark1russell7/bundle-dev) - Development bundle
