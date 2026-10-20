---
"@procedures/mcp-server": patch
---

Fixed: `zod` is a dependency of `@procedures/mcp-server`, not a development dependency (CLI-63). The procedures `mcp.serve` and `mcp.listTools` import `zod` for their input schemas. Before, a strict consumer (pnpm) could not start the package. Node stopped with `ERR_MODULE_NOT_FOUND` for `zod`. Thus each MCP server on `createMcpHost()` failed at the start. npm and the tests of the monorepo hoist the packages. Thus they did not show the error.

- A strict consumer (pnpm) can start `@procedures/mcp-server`. Nothing changes for other consumers.
- The range is `^4.6.5`, the same range as the `zod` dependency of `@procedures/client`. Thus a consumer gets one copy of `zod`.
- The new script `scripts/check-declared-imports.mjs` examines each published package, and CI starts it. It fails when an entry of a package reaches an import of a package that the package does not declare.

PATCH: a dependency of the package changes, and no API changes.
