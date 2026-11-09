---
"@procedures/client": patch
"@procedures/mcp-server": patch
"@procedures/mongo": patch
"@procedures/peer": patch
"@procedures/store": patch
"@procedures/mcp-dev-tools": patch
"@procedures/llm": patch
"@procedures/mark": patch
"@procedures/schedule": patch
"@procedures/server": patch
"@procedures/systems": patch
---

The packages use `@mark1russell7/service` `^0.8.2` in place of `^0.6.0`. Version 0.7.0 adds the refusal cause `capacity`, and version 0.8.0 refuses a listen backlog of 0. Version 0.8.2 adds the call context of OpenTelemetry. The types `Clock` and `Cancel` of `@mark1russell7/service/clock` do not change: their home is `@mark1russell7/algebra/clock`, and the entry gives them again.

A refusal of a call limit with the cause `capacity` gives `RATE_LIMITED` that is not retryable and has no `retry-after`. A take of one unit does not get this cause, because each policy holds 1 unit or more.
