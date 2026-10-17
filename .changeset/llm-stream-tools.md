---
"@procedures/llm": patch
---

`llm.stream` starts procedures as tools, as `llm.complete` does (O12). The release is a patch: the input gets new optional fields, and the new stream items come only with them. A reader that does not give `procedures` gets the same items as before.

- `llm.stream` takes `procedures` and `maxRounds`, with the rules of `llm.complete`: the tools that a procedure can be, the admission and the capability of the host, a forced `toolChoice` for the first request only, the cap of 200000 characters for a tool result, and the default of 8 requests.
- When an answer stops for its procedure tools, the stream gives a `tool_call` item and a `tool_result` item for each tool. Then the next answer streams in the same output, with its own `start` item.
- The `stop` item comes once, at the end. Its `usage` is the sum of all the requests, and its `text` has the text of all the answers. With `procedures`, it also has `toolCalls`, `rounds` and `roundLimit`.
- The next request has each content block of a streamed answer, with the thinking signatures and the citations.
- `llm.stream` is data-driven (`markDataDriven`), as `llm.complete` is. The host examines each nested call with its capability and its expose rule.
- The two procedures use one loop, `toolLoop` of `src/loop.ts`. Each request of the loop gets the automatic retry.
- Fix for `llm.complete` and `llm.stream`: the abort of the signal stops the wait for a tool at once, with `ABORTED`. Before, the call waited for a tool that did not read the signal.
- The new types are `LlmStreamToolCall` and `LlmStreamToolResult`. `LlmToolInput` has `procedures` and `maxRounds`.
