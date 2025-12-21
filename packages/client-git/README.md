# @mark1russell7/client-git

Git operations as RPC procedures. Status, commit, push, pull, and more.

## Installation

```bash
npm install github:mark1russell7/client-git#main
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application                                     │
│                                                                              │
│   await client.call(["git", "status"], { cwd: "/my/repo" })                 │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             client-git                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        Repository State                                │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐             │  │
│  │  │git.status│  │ git.log  │  │ git.diff │  │git.branch│             │  │
│  │  │ Get state│  │ History  │  │ Changes  │  │ Branches │             │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Staging & Commits                              │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐                          │  │
│  │  │ git.add  │  │git.commit│  │git.checkout│                          │  │
│  │  │  Stage   │  │  Commit  │  │  Switch    │                          │  │
│  │  └──────────┘  └──────────┘  └────────────┘                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                           Remote Sync                                  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐             │  │
│  │  │ git.push │  │ git.pull │  │ git.fetch│  │git.remote│             │  │
│  │  │  Push    │  │  Pull    │  │  Fetch   │  │  Manage  │             │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        Repository Setup                                │  │
│  │  ┌──────────┐  ┌──────────┐                                          │  │
│  │  │ git.init │  │git.clone │                                          │  │
│  │  │ Init repo│  │Clone repo│                                          │  │
│  │  └──────────┘  └──────────┘                                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         client-shell                                     ││
│  │                  shell.run("git", [...args])                            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { Client } from "@mark1russell7/client";
import "@mark1russell7/client-git/register";

const client = new Client({ /* transport */ });

// Get repository status
const status = await client.call(["git", "status"], {
  cwd: "/path/to/repo",
});
console.log(status.branch, status.files);

// Stage and commit
await client.call(["git", "add"], { all: true });
await client.call(["git", "commit"], { message: "feat: add new feature" });

// Push to remote
await client.call(["git", "push"], { remote: "origin" });
```

## Procedures

| Path | Description |
|------|-------------|
| `git.status` | Get repository status |
| `git.add` | Stage files |
| `git.commit` | Create commit |
| `git.push` | Push to remote |
| `git.pull` | Pull from remote |
| `git.fetch` | Fetch from remote |
| `git.clone` | Clone repository |
| `git.checkout` | Checkout branch/files |
| `git.branch` | Branch operations |
| `git.log` | Show commit log |
| `git.diff` | Show changes |
| `git.init` | Initialize repository |
| `git.remote` | Manage remotes |

### git.status

Get current repository status.

```typescript
interface GitStatusInput {
  cwd?: string;          // Repository path
  short?: boolean;       // Short format (default: false)
}

interface GitStatusFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked" | "ignored";
  staged: boolean;
}

interface GitStatusOutput {
  branch: string;        // Current branch
  ahead: number;         // Commits ahead of remote
  behind: number;        // Commits behind remote
  files: GitStatusFile[];
  clean: boolean;        // No uncommitted changes
}
```

### git.add

Stage files for commit.

```typescript
interface GitAddInput {
  paths?: string[];      // Paths to stage (default: [])
  all?: boolean;         // Stage all changes (default: false)
  cwd?: string;          // Repository path
}

interface GitAddOutput {
  staged: string[];      // Paths that were staged
}
```

### git.commit

Create a commit.

```typescript
interface GitCommitInput {
  message: string;       // Commit message
  all?: boolean;         // Auto-stage modified files (default: false)
  amend?: boolean;       // Amend last commit (default: false)
  cwd?: string;          // Repository path
}

interface GitCommitOutput {
  hash: string;          // Full commit hash
  message: string;       // Commit message
  author: string;        // Author name
  date: string;          // Commit date (ISO)
}
```

### git.push

Push commits to remote.

```typescript
interface GitPushInput {
  remote?: string;       // Remote name (default: "origin")
  branch?: string;       // Branch to push (default: current)
  force?: boolean;       // Force push (default: false)
  setUpstream?: boolean; // Set upstream tracking (default: false)
  cwd?: string;          // Repository path
}

interface GitPushOutput {
  remote: string;
  branch: string;
  commits: number;       // Number of commits pushed
}
```

### git.pull

Pull changes from remote.

```typescript
interface GitPullInput {
  remote?: string;       // Remote name (default: "origin")
  branch?: string;       // Branch to pull (default: current)
  rebase?: boolean;      // Rebase instead of merge (default: false)
  cwd?: string;          // Repository path
}

interface GitPullOutput {
  remote: string;
  branch: string;
  commits: number;       // Number of commits pulled
  fastForward: boolean;  // Was fast-forward
}
```

### git.clone

Clone a repository.

```typescript
interface GitCloneInput {
  url: string;           // Repository URL
  dest?: string;         // Destination directory
  branch?: string;       // Branch to clone (default: default branch)
  depth?: number;        // Shallow clone depth
  cwd?: string;          // Working directory
}

interface GitCloneOutput {
  path: string;          // Cloned repository path
  branch: string;        // Checked out branch
}
```

### git.log

Show commit history.

```typescript
interface GitLogInput {
  count?: number;        // Number of commits (default: 10)
  oneline?: boolean;     // One line per commit (default: false)
  ref?: string;          // Branch/tag/commit to start from
  cwd?: string;          // Repository path
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
}
```

### git.diff

Show changes.

```typescript
interface GitDiffInput {
  staged?: boolean;      // Show staged changes (default: false)
  ref?: string;          // Compare against ref
  paths?: string[];      // Specific paths to diff
  stat?: boolean;        // Show stat summary only (default: false)
  cwd?: string;          // Repository path
}

interface GitDiffFile {
  path: string;
  additions: number;
  deletions: number;
}

interface GitDiffOutput {
  files: GitDiffFile[];
  additions: number;     // Total additions
  deletions: number;     // Total deletions
  diff?: string;         // Full diff (if stat=false)
}
```

### git.branch

Branch operations.

```typescript
interface GitBranchInput {
  name?: string;         // Branch name (for create/delete)
  delete?: boolean;      // Delete branch (default: false)
  list?: boolean;        // List branches (default: true if no name)
  remote?: boolean;      // Include remote branches (default: false)
  cwd?: string;          // Repository path
}

interface GitBranchInfo {
  name: string;
  current: boolean;
  remote: boolean;
  tracking?: string;     // Remote tracking branch
}

interface GitBranchOutput {
  branches?: GitBranchInfo[];
  created?: string;      // Created branch name
  deleted?: string;      // Deleted branch name
  current: string;       // Current branch
}
```

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLI Wrapper Layer                                    │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   client-git    │  │   client-pnpm   │  │       client-cli            │ │
│  │   git.*         │  │   pnpm.*        │  │       cli.run               │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┬───────────────┘ │
│           │                    │                         │                  │
│           └────────────────────┼─────────────────────────┘                  │
│                                ▼                                            │
│                     ┌─────────────────────┐                                │
│                     │    client-shell     │                                │
│                     │ shell.run/exec/which│                                │
│                     └─────────────────────┘                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## License

MIT
