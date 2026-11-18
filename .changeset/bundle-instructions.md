---
"@procedures/mcp-server": patch
"@procedures/mcp-dev-tools": patch
---

A bundle or a module file can export `mcpInstructions`: a text for the model, for example the tool to read first (d40-tool-surface). `mergeInstructions` of `@procedures/mcp-server` joins the texts of some bundles. The dev-tools server gives the joined instructions of its bundles and module files to the client at the start of each session. A module file of the tools of another repository thus keeps the instructions of its own server.
