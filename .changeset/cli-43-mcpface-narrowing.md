---
"@procedures/mcp-server": patch
---

New: the option `narrowing` of `mcpFace()` (CLI-43). The option gives each call of the face a narrower capability, as a `CapabilityRequest` or a list of them. The face adds it as one more source of the narrowing key (`procedure-narrowing`, CLI-30), so the server applies the meet of all the sources. A narrowing can only narrow: a part that asks for more than the policy of the host gives has no effect. The face lists only the tools that the narrowed capability permits. Thus `mcpFace({ narrowing: { effects: { writes: [] } } })` is a read-only MCP face on the port of the host, as `mark mcp --read-only` is over stdio. A narrowing that is not valid stops the factory with an error. Without the option, the face does not change.
