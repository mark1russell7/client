---
"@procedures/archive": patch
"@procedures/cli-kit": patch
"@procedures/client": patch
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

The public enums `ErrorCategory`, `ErrorSeverity` and `WebSocketState` keep their values and names, and each member stays usable as a type. The only change for a caller: a string with the value of a member now fits the type of the set.
