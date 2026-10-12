# Release

This document tells how the packages of the monorepo go to npm. The first release needs a one-time bootstrap. Each later release starts from GitHub Actions.

## The packages

- The npm scope of the packages is `@procedures`. The npm name can differ from the folder (the root README has the table). Until 2026-10-12 the scope was `@mark1russell7`. `scripts/lib/old-names.mjs` maps each old name to its new name.
- The 30 public packages have one version together. The `fixed` group of `.changeset/config.json` names each one.
- `site`, `documentation` and the repository tool (`packages/cli`) are private. They are not published.
- The MCP server of `packages/impl-mcp-dev` is published as `@procedures/mcp-dev-tools`, with the bin `mcp-dev-tools`.
- Three packages use general packages from other repositories: `client-cue` uses `@mark1russell7/cue`, `client-splay` uses `@mark1russell7/splay`, and `client-sqlite` uses `@mark1russell7/docker-sqlite`.

## The package check

`node scripts/check-packages.mjs` examines the packages as a user gets them from npm. Start `pnpm build` first. For each public package, the script does these steps:

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
node scripts/use-npm-general-packages.mjs
pnpm build
node scripts/check-packages.mjs
```

The script examines that each version is on npm. Then it changes the specifiers, removes the git build approvals of `pnpm-workspace.yaml`, and starts `pnpm install`. Commit the result.

### 2. Stage the packages of the monorepo

```sh
npm login
node scripts/npm-bootstrap.mjs --dry-run
node scripts/npm-bootstrap.mjs
```

The script packs each public package with pnpm and stages it with `npm stage publish`. It skips a version that is on npm. It refuses a package with a git dependency.

If npm refuses the staged publish with HTTP 429 ("rate limited exceeded"), publish directly. npm limits the staged publish of new packages (on 2026-10-12 it refused each one after 25 new packages in one day), but not the direct publish. Start this command in a terminal. npm opens the browser for the 2FA of each package, and the step 3 is not necessary:

```sh
node scripts/npm-bootstrap.mjs --publish
```

### 3. Approve the staged versions

Start this command in a terminal. For each staged version of the packages, it starts `npm stage approve <id>`, and npm opens the browser for the 2FA:

```sh
node scripts/npm-bootstrap.mjs --approve
```

You can also approve each staged version on npmjs.com.

### 4. Connect each package to the release workflow

```sh
node scripts/npm-bootstrap.mjs --trust
```

The script starts `npm trust github <package> --file release.yml --repo mark1russell7/client --env npm --allow-publish` for each package, in the terminal, so npm can open the browser for the 2FA. If a command fails, start the script again with `--only <package,package>`.

### 5. Set the repository and the packages

- Each run in the GitHub environment `npm` waits for the approval of the owner. The environment exists already.
- In the settings of the repository, turn on `Allow GitHub Actions to create and approve pull requests`. The release workflow opens the version pull request.
- After the first release from the workflow, set "Require two-factor authentication and disallow tokens" for each package on npmjs.com.

### 6. Point the old packages to the new names

22 packages went to npm as `@mark1russell7/*` 0.1.0 before the scope change. After the `@procedures` packages are on npm, start this command in a terminal. For each old package on npm, it starts `npm deprecate` with the new name, and npm opens the browser for the 2FA:

```sh
node scripts/npm-bootstrap.mjs --deprecate-old --dry-run
node scripts/npm-bootstrap.mjs --deprecate-old
```

A user who installs an old package sees "Moved to `@procedures/<name>`". The old versions stay on npm, so nothing breaks.

## A release

1. For each change that users see, add a changeset: start `pnpm changeset` and answer the questions. Commit the file.
2. On GitHub, open Actions, select "Release", and start the workflow. Approve the `npm` environment.
3. The workflow opens the pull request "Version the packages". It sets the new version and writes the change logs. Merge it.
4. Start the workflow again. It does the checks and the strict package check. Then it publishes each version that is not on npm, with provenance.

## A new public package

1. Make it with `lib new`, as `client/CLAUDE.md` tells.
2. Give it the metadata of the other packages: `description`, `keywords`, `homepage`, `bugs`, `repository` with `directory`, `license`, `author`, `files` and `publishConfig`.
3. Copy `LICENSE` into its folder, and add `CHANGELOG.md`.
4. Add its name to the `fixed` group of `.changeset/config.json`. The package check fails without it.
5. Before its first release, stage it with `node scripts/npm-bootstrap.mjs --only <name>`, and connect it with `--trust`.
