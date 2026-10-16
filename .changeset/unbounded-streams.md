---
"@procedures/client": minor
"@procedures/mcp-server": minor
"@procedures/docker": patch
"@procedures/shell": patch
---

Streams that can run without an end (roadmap R15). A procedure declares `stream: { unbounded: true }` in its metadata (`docker.logs`, for `follow`, and `shell.stream` do). `ProcedureServer` marks its stream response, and the faces that collect a stream obey the mark: HTTP without NDJSON answers 406 `NOT_ACCEPTABLE` at once (before, the request waited until a timeout), and the MCP transport stops the stream at its `streamLimits` (default 100 items or 30 seconds) and says so in the result (before, `docker.logs` with `follow` ended only at the time limit of 10 minutes).
