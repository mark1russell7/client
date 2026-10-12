# Changesets

A changeset records a change to the published packages and the version step that it needs. To add one, start `pnpm changeset` and answer the questions. The release workflow reads the changesets, sets the versions and writes the change logs.

- The public packages have one version together. The `fixed` group of `config.json` names each one.
- A new public package must go into the `fixed` group. `node scripts/check-packages.mjs` fails when one is missing.
- The private packages (`site`, `documentation` and the repository tool) get no version and no change log.

[RELEASE.md](../packages/documentation/RELEASE.md) tells how to publish.
