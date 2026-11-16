---
"@procedures/mcp-server": patch
---

Deprecated: the raw text of a nested untrusted field in the structured content of an MCP tool. From 0.61.0, the structured content puts each nested untrusted string in its envelope. A code caller that reads the raw nested text must read the envelope.
