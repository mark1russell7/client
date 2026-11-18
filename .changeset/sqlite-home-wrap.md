---
"@procedures/compiler": patch
"@procedures/sqlite": patch
"@procedures/bundle-mcp": patch
---

`@procedures/sqlite` has generated procedures for 9 functions of `@mark1russell7/sqlite` (d40-handles). `sqlite.openDatabase` gives a database handle in the scope of the caller. The other 8 procedures take the handle, for example `sqlite.tableColumns` and `sqlite.checkIntegrity`. The register entry also registers `handle.list` and `handle.close`.

`exportsModule()` of `@procedures/compiler` also takes a loader in place of the functions. The first call loads the package one time. A failed load does not stay. The overlay of a wrap can give the rules under a root of a host (`fsRoot`). The loader gives them to each procedure as `metadata.fsRoot`.

The MCP tools do not change: `@procedures/bundle-mcp` keeps the new procedures out of the tools.
