---
"@procedures/mcp-dev-tools": patch
---

`MCP_BUNDLES` takes module files next to the bundles: a `file:` URL, an absolute path, or a path that starts with `./` or `../`. The default export of the file is a procedure module. Its `mcpNamespaces`, or else the namespaces of its own procedures, give its tools. Thus a repository outside the monorepo gives its tools to this server, with no second MCP server. The file can use its own copy of `@procedures/client`.
