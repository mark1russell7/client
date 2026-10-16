---
"@procedures/bundle-mcp": minor
"@procedures/mcp-dev-tools": minor
---

The pure transforms of `@procedures/json` are MCP tools (roadmap R39): `json.query`, `json.patch`, `json.diff`, `json.merge`, `json.validate`, `yaml.parse` and `yaml.stringify`. A program that Claude runs through `client.chain` can use them in its steps. The MCP server has 86 tools. `@procedures/http` is not a tool namespace, because a request can carry data out.
