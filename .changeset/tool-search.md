---
"@procedures/client": patch
"@procedures/mcp-server": patch
"@procedures/mcp-dev-tools": patch
"@procedures/mark": patch
---

The tool search (direction 40, the tool surface). A server with thousands of tools now gives the model three tools in place of each tool.

- `@procedures/client`: the new core procedure `procedure.search` finds the procedures by words. It searches only the procedures that the host exposes. The ranking is BM25 over the key, the tags and the description. The functions `searchDocuments` and `searchWords` give the same ranking to each catalog of tools.
- `@procedures/mcp-server`: the new option `listing: "search"` of the transport and of `createMcpHost()` lists three tools: `search_tools`, `describe_tool` and `call_tool`. The expose rule and the call policy do not change. The default `"each"` keeps the list of each tool.
- `@procedures/mcp-dev-tools` and `@procedures/mark`: `MCP_LISTING=search` and `mark mcp --listing search` start the dev-tools server with the search listing.

A list of the three tools is 1410 bytes of JSON. The list of each tool costs about 386 tokens for each tool.
