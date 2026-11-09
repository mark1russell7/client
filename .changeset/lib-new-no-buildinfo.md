---
"@procedures/lib": patch
---

`lib.new` writes `!dist/.tsbuildinfo` after `dist` in the field `files` of a new package, so npm does not pack the build info file of tsc. With cue 2.1.3 the entry is already there, and `lib.new` does not add a second one.

The module of `@procedures/lib` brings the module of `@procedures/shell`. Before, `createRegistry(libModule)` had no `shell.run`, and `lib.new` uses it.

PATCH: a bug fix, the exports do not change.
