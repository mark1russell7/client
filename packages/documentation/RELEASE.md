# Release

This document tells how the packages of the monorepo go to npm. The first release needs a one-time bootstrap. Each later release starts from GitHub Actions.

## The packages

- The npm scope of the packages is `@procedures`. The npm name can differ from the folder (the root README has the table). Until 2026-10-12 the scope was `@mark1russell7`. `scripts/lib/old-names.ts` maps each old name to its new name.
- The 30 public packages have one version together. The `fixed` group of `.changeset/config.json` names each one.
- `site` and `documentation` are private. They are not published.
- The MCP server of `packages/impl-mcp-dev` is published as `@procedures/mcp-dev-tools`, with the bin `mcp-dev-tools`.
- Three packages use general packages from other repositories: `client-cue` uses `@mark1russell7/cue`, `client-splay` uses `@mark1russell7/splay`, and `client-sqlite` uses `@mark1russell7/docker-sqlite`.

## The package check

`node scripts/check-packages.ts` examines the packages as a user gets them from npm. Start `pnpm build` first. For each public package, the script does these steps:

1. It packs the package with pnpm. pnpm writes the versions of the `workspace:*` dependencies.
2. It reads the packed `package.json`. A `workspace:` or git specifier is an error. The metadata, `LICENSE` and `README.md` must be in the tarball.
3. It examines the tarball with `publint --strict`, and with `attw` and its ESM-only profile.
4. It installs all the tarballs into an empty project.
5. It imports each package root, runs a program with the client, and starts each bin with `--help`.

The option `--allow-git-deps` accepts the `github:` dependencies of the general packages. CI uses it until the general packages are on npm. The release workflow does not use it, because npm 12 does not install git dependencies by default.

## The one-time bootstrap

npm trusts a workflow only for a package that exists. Thus the first version of each package comes from a computer, as a staged publish. The registry keeps a staged version until the owner approves it with 2FA.

### 1. Publish the general packages

Each general repository has the file `docs/release.md`. Publish them in this order:

1. `@mark1russell7/cue` 1.0.0. Its branch `npm-release` has the release changes. Merge the branch after the publish, because its presets write `^1.0.0`.
2. `@mark1russell7/splay` 0.1.0.
3. `@mark1russell7/docker-sqlite` 0.1.0.

Then switch the monorepo to the npm versions, and examine the packages:

```sh
node scripts/use-npm-general-packages.ts
pnpm build
node scripts/check-packages.ts
```

The script examines that each version is on npm. Then it changes the specifiers, removes the git build approvals of `pnpm-workspace.yaml`, and starts `pnpm install`. Commit the result.

### 2. Stage the packages of the monorepo

```sh
npm login
node scripts/npm-bootstrap.ts --dry-run
node scripts/npm-bootstrap.ts
```

The script packs each public package with pnpm and stages it with `npm stage publish`. It skips a version that is on npm or staged. It refuses a package with a git dependency.

To publish without the approval step, publish directly. Start this command in a terminal. npm opens the browser for the 2FA. The command stops at the first failure. Start it again: it skips the versions on npm. Step 3 is then not necessary:

```sh
node scripts/npm-bootstrap.ts --publish
```

npm limits the number of new packages of one account. Then each new package fails with HTTP 429 ("rate limited exceeded"), for the staged and the direct publish. On 2026-10-12, this occurred after 25 new packages. Wait for the limit to reset, or ask npm support for a higher limit.

### 3. Approve the staged versions

Start this command in a terminal. For each staged version of the packages, it starts `npm stage approve <id>`, and npm opens the browser for the 2FA:

```sh
node scripts/npm-bootstrap.ts --approve
```

You can also approve each staged version on npmjs.com.

### 4. Connect each package to the release workflow

```sh
node scripts/npm-bootstrap.ts --trust
```

The script starts `npm trust github <package> --file release.yml --repo mark1russell7/client --allow-publish` for each package, in the terminal, so npm can open the browser for the 2FA. It skips a package that trusts the workflow already, and a package that is not on npm. You can start it again at any time.

### 5. Set the repository and the packages

- The publish job has no GitHub environment, and the trusted publishers name none. The approval of a publish is the merge of a version commit to `main`, or a start by hand. Only a person who can write to `main` can do these steps. Refer to "The OIDC exchange of npm".
- The setting `Allow GitHub Actions to create and approve pull requests` is on (2026-10-17). Thus the release workflow opens the pull request "Version the packages", and nobody pushes the version commit by hand. Before 2026-10-17, the version step was a commit on `main` (ae9ed9f, 41007b6, 844a317).
- After the first release from the workflow, set "Require two-factor authentication and disallow tokens" for each package. Start this command in a terminal. npm opens the browser for the 2FA:

  ```sh
  node scripts/npm-bootstrap.ts --lock
  ```

### 6. Point the old packages to the new names

22 packages went to npm as `@mark1russell7/*` 0.1.0 before the scope change. After the `@procedures` packages are on npm, start this command in a terminal. For each old package on npm, it starts `npm deprecate` with the new name, and npm opens the browser for the 2FA:

```sh
node scripts/npm-bootstrap.ts --deprecate-old --dry-run
node scripts/npm-bootstrap.ts --deprecate-old
```

A user who installs an old package sees "Moved to `@procedures/<name>`". The old versions stay on npm, so nothing breaks. The command does not deprecate an old package before its new package is on npm. Start it again after the last publish.

## A release

1. For each change that users see, add a changeset: start `pnpm changeset` and answer the questions. Commit the file.
2. Start `gh workflow run release.yml --repo mark1russell7/client`, or "Release" from Actions on GitHub. With changesets on `main`, the workflow opens or updates the pull request "Version the packages". It sets the new versions and writes the change logs.
3. GitHub starts no checks for a pull request that the workflow token opens. To start the checks, close the version pull request and open it again.
4. Merge the version pull request when its checks are green. Merge it with your own account: a merge with the workflow token starts no workflow. The merge starts the release workflow, and no second start is necessary. The run waits for the green CI run of the merge on `main`, and then it publishes.
5. The workflow does the checks and the strict package check. Then `scripts/publish-ci.ts` packs each version that is not on npm. A different job publishes the tarballs with provenance.
6. For each version that it publishes, the workflow makes the git tag `<name>@<version>` and a GitHub release with the change log of that version.
   - If a release made no tags or no GitHub releases, start `node scripts/release-tags.ts --commit <sha of "Version the packages">`. It makes the missing ones, and `--dry-run` tells them first. The tags and releases of 0.3.0 come from this script.
7. If the publish stops, open the run on GitHub and start "Re-run failed jobs". The jobs skip the versions that are on npm.
8. npm shows a new version some minutes after the publish. Until then, `npm view` shows the previous version.

### Who does what

- The author of a change adds its changeset. A maintainer starts the workflow to open the version pull request. The maintainer merges that pull request when its checks are green, and the merge publishes.
- The owner keeps these steps: a new public package (its bootstrap and its first publish), the trust changes on npm (`--trust` and `--lock`), and the repair of a failed release.

### The two starts of the workflow

- **A push to `main`.** Only a push that changes `packages/client/package.json` starts a run. The job `gate` compares the version in that file with the version on `main` before the push. When the two versions are different, the commit is a version commit, and the run publishes the versions of that commit. For a different change of the file, for example a dependency, the run stops after the job `gate`.
- **A start by hand (`workflow_dispatch`).** The run works as before. With changesets, it opens or updates the version pull request. Without changesets, it publishes each version that is not on npm.

A version-commit run publishes also when a newer changeset waits at the commit. This occurs when a changeset merges after the workflow made the version pull request. The changeset stays for the next version pull request. Before this change, a start by hand at such a commit opened the next version pull request and published nothing.

A version-commit run does not start the Changesets action. With changesets, that action moves the working tree to the branch `changeset-release/main` and writes the next versions there. A pack after it packs those versions, not the versions of the commit.

The job `gate` compares the last commit of a push with the head of `main` before the push (`github.event.before`). So a push of more than one commit is a version commit when any of its commits changes the version. When the event has no such commit, the job uses the first parent.

A changed version publishes only when the merge of a version pull request made the commit. The branch of that pull request is `changeset-release/main` (the Changesets action) or `release/<version>` (a local `pnpm changeset version`). The job `gate` reads the pull request of the commit with the GitHub API. When a different pull request or a push with no pull request changes the version, the run stops with an error and publishes nothing. To publish such a commit, start the workflow by hand on `main`.

A person merges the version pull request, or turns on its auto-merge. GitHub starts no workflow for a push that the `GITHUB_TOKEN` of a workflow makes. So a merge by a bot with that token publishes nothing, and no run tells why. Then start the workflow by hand on `main`.

### One run at a time

The runs of the release workflow wait in one queue: the concurrency group `release` with `queue: max`. A run starts when the run before it ends. No run cancels a different run. Without `queue: max`, GitHub keeps only one waiting run in a group, and a newer run cancels the waiting run.

- A version merge while a release runs: the run of the merge waits. Then it publishes.
- A version merge, and then a push that changes only a dependency in `packages/client/package.json`: the second run waits until the end of the earlier run. Then its job `gate` finds no version change, and the second run stops.
- Two starts by hand: the second run waits until the end of the earlier run. Then it opens the version pull request or publishes, as before.

A push run waits for the CI run of its commit in the job `ci`, for 120 minutes or less. While it waits, the runs after it wait too.

### The jobs of the release workflow

The workflow has six jobs. Only one job starts the code of this repository, and that job gets no OIDC token. The release of `mark1russell7/template` uses the same pattern.

| Job | Permissions | What it does |
|---|---|---|
| `gate` | `contents: read`, `pull-requests: read` | It reads the version of the commit and of `main` before the push, and the pull request of the commit, with the GitHub API. It gives the kind of the run: `version-commit`, `none` or `dispatch`. |
| `ci` | `actions: read` | It stops the run when the commit has no green CI run on `main`. In a push run, it first waits for that CI run. |
| `build` | `contents: write`, `pull-requests: write` | It does the checks. Then it opens the version pull request, or it packs the versions that are not on npm. |
| `publish` | `id-token: write` | The action `npm-publish` of the template publishes the tarballs with the npm CLI. |
| `github-release` | `contents: write` | The workflow `reusable-release-tag.yml` of the template makes the git tags and the GitHub releases. |
| `latest` | `contents: write` | It makes the release of `@procedures/client` the latest release. |

- The jobs `gate` and `ci` do no checkout. They read only data from the GitHub API.
- The job `build` installs, builds and tests the code of this repository. Its write permissions are only for the version pull request.
- `scripts/publish-ci.ts` writes two artifacts of the run. The artifact `release` has `packages.txt` and the tarballs. The artifact `tags` has the plan of the GitHub releases.
- pnpm packs each package, so the tarballs have the versions of the `workspace:*` dependencies.
- On 2026-10-16, the publish of pnpm 12 got HTTP 404 for each package. Thus the npm CLI publishes the tarballs.
- The jobs `publish`, `github-release` and `latest` do no checkout and no install. They start only the pinned action and workflow of the template, and `gh`.
- When npm has each version, the job `build` writes the mode `none`, and the later jobs do not start.
- The action `npm-publish` skips each version that is on npm. Thus a second run after a partial publish is safe.
- After a failed publish, the job `github-release` still makes the tags of the versions that the run published.
- A version of an earlier run gets a tag only when npm has its provenance statement from this repository. The tag goes on the commit of that statement.

### Only a commit on main

A release publishes only a commit that is on `main`. The job `build` compares the commit of the run with `main`. The commit must be the head of `main` or an older commit of `main`.

- A manual run on the branch of a pull request publishes nothing. Merge the pull request first.
- A run that a push to `main` starts is on a commit of `main`. It passes also when `main` gets newer commits while the run waits.
- To publish a version commit again after `main` has newer commits, re-run the failed jobs of its run. When no changeset waits at that commit, you can also push the branch `release/<version>` at that commit. Then start `gh workflow run release.yml --repo mark1russell7/client --ref release/<version>`.
- GitHub refuses a tag from the workflow (HTTP 403) when the workflow files of the commit match no branch. Then the summary of the run shows a `gh release create` command. Start it with your own token, or start `scripts/release-tags.ts`.

### The OIDC exchange of npm

On 2026-10-16, npm refused the OIDC exchange of this repository with "package not found". This repository has the immutable OIDC subject of GitHub ([npm/cli#9969](https://github.com/npm/cli/issues/9969)), and each trusted publisher named the GitHub environment `npm`. The systems repository has the same subject and publishes, and its trusted publishers name no environment. So on the same day the trusted publishers of the 30 packages were made again without an environment, and the release job lost its environment. Then the workflow published 0.2.1 and 0.2.2 with OIDC and provenance.

If the exchange fails again, publish the release from the computer of the owner:

1. Merge the version pull request, or start `pnpm changeset version` and commit the result.
2. Start `git pull`, `pnpm install` and `pnpm build`.
3. In a terminal, start `node scripts/npm-bootstrap.ts --publish`. npm opens the browser for the 2FA.

A version from the computer has no provenance statement.

## A new public package

1. Make it with `lib new`, as `client/CLAUDE.md` tells.
2. Give it the metadata of the other packages: `description`, `keywords`, `homepage`, `bugs`, `repository` with `directory`, `license`, `author`, `files` and `publishConfig`.
3. Copy `LICENSE` into its folder, and add `CHANGELOG.md`.
4. Add its name to the `fixed` group of `.changeset/config.json`. The package check fails without it.
5. Before its first release, publish it from a terminal with `node scripts/npm-bootstrap.ts --publish --only <name>`. npm shows the new package some minutes later. Then connect it with `--trust --only <name>`.
6. Start the next release soon. Since 2026-10-02, npm deletes a new trusted publisher that has no successful publish in 48 hours.
