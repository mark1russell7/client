---
"@procedures/mcp": patch
"@procedures/mcp-server": patch
---

The MCP packages follow the rules of the error codes and of the path codec (roadmap O70).

- `@procedures/mcp-server`: the limit of the task store can refuse a task. The result of that task has `_meta` with the code `RATE_LIMITED` and `retryable: true`, as the other error results. Before, it had no `_meta`.
- `@procedures/mcp`: `encodePath()` and `decodePath()` use `pathToKey()` and `keyToPath()` of `@procedures/client`. A segment with a dot comes back as one segment. The name of a sanitized path does not change.
