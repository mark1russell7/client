---
"@procedures/archive": patch
"@procedures/cli-kit": patch
"@procedures/client": minor
"@procedures/compiler": patch
"@procedures/fs": patch
"@procedures/gh": patch
"@procedures/git": patch
"@procedures/http": patch
"@procedures/json": patch
"@procedures/mcp-server": patch
"@procedures/mongo": patch
"@procedures/s3": patch
"@procedures/schedule": patch
"@procedures/server": patch
"@procedures/shell": patch
"@procedures/sqlite": patch
"@procedures/store": patch
---

The source now uses only syntax that a type stripper erases, so the setting `erasableSyntaxOnly` of `@mark1russell7/cue` 2.1.1 stays on. Each enum is now a constant object with a type of the same name. Each parameter property is now a field and an assignment in the constructor.

**Breaking.** MINOR before 1.0.0: `ErrorCategory`, `ErrorSeverity` and `WebSocketState` are now constant objects. Their names and values stay the same, and each member stays usable as a type. A member is no longer a constant expression: `enum E { A = ErrorSeverity.WARNING }` gives TS18033, and a `const enum` gives TS2474. Also, a string with the value of a member now fits the type of the set.

**Migration.** In an enum initializer, write the value in place of the member, for example `"warning"`, or use a constant object. Other uses need no change. The site and the known apps need no change.
