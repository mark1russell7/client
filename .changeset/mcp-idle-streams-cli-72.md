---
"@procedures/mcp-server": patch
---

The stop of the intake of `mcpFace()` ends the idle GET streams of the MCP sessions (roadmap CLI-72).

PATCH: a fix with no API change.

- Before, each session kept its GET stream open until the close of the face. The drain of the listener counted each open stream as work in progress. Thus a host with connected MCP clients waited for the full cap of the drain at each stop, also with no call in progress. On the fleet site, six idle clients made each stop wait for its 4 s cap.
- With this fix, the stop of the intake ends the GET stream of each session without a task in progress. The SDK ends the response in its protocol, so a client of the MCP SDK connects again, to the next server. Thus the drain waits only for the calls and the tasks.
- A session with a task in progress keeps its GET stream, because the progress and the end of the task go on it. The stream ends with the work of the task.
- After the stop of the intake, a new session and a new GET stream get 503 with `UNAVAILABLE` and `Retry-After`, as on the other faces. A POST or a DELETE of a session goes on, so a call in progress completes with its answer stream.
- The test `mcp-stop.test.ts` of `@procedures/peer` measures the stop on the fake clock of the host.
