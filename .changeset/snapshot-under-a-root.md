---
"@procedures/snapshot": patch
---

`snapshot.create` and `snapshot.diff` work under a root of the files (`mark --fs-root`). Before, a root refused them (tracker item O46).

- Their git commands go through the `git.*` procedures of the host, so the rules of git under a root apply.
- Under a root, each folder of `paths` must be in the root. `snapshot.create` takes the root when the call gives no `paths`. `snapshot.diff` needs `paths`.
- Under a root, pnpm does not start, and the snapshot records the pnpm version as `unknown`. `snapshot.create` does not read a `package.json` whose real path is outside the root.
- Without a root, the procedures give the same results as before. A host needs the procedures `git.revParse`, `git.remote` and `git.diff` of `@procedures/git`, as it needs `git.status` already.
