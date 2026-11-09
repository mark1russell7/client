---
"@procedures/mcp-server": patch
"@procedures/mongo": patch
"@procedures/peer": patch
"@procedures/sqlite": patch
"@procedures/store": patch
"@procedures/client": patch
"@procedures/compiler": patch
"@procedures/mcp-dev-tools": patch
"@procedures/llm": patch
"@procedures/mark": patch
"@procedures/schedule": patch
"@procedures/server": patch
"@procedures/systems": patch
---

The packages use the new versions of their dependencies of the owner: `@mark1russell7/service` `^0.8.3`, `@mark1russell7/coeval` `^0.26.1` and `@mark1russell7/docker-sqlite` `^0.3.0`. The range of `@mark1russell7/collections` stays `^0.5.0`: its version 0.7.0 and later remove names that `@procedures/collections` exports.
