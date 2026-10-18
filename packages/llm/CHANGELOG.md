# @procedures/llm

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2
  - @procedures/http@0.9.2
  - @procedures/json@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1
  - @procedures/http@0.9.1
  - @procedures/json@0.9.1

## 0.9.0

### Patch Changes

- dca28c1: The packages accept `@mark1russell7/service` 0.5.1 and later 0.5 versions, and `@procedures/client` accepts `@mark1russell7/algebra` 0.7.1. Before, the range `^0.4.1` stopped below 0.5. An application on service 0.5 then got a second copy of service inside the client.
  
  - The client uses only the `/backoff`, `/heartbeat` and `/testing` entries of service. The code of `/backoff`, `/heartbeat` and the clock is the same in 0.4.1 and 0.5.1. `/testing` only gets new exports.
  - The public API of the client does not change.
- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0
  - @procedures/http@0.9.0
  - @procedures/json@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1
  - @procedures/http@0.8.1
  - @procedures/json@0.8.1

## 0.8.0

### Patch Changes

- a9f5420: The tool loop of `llm.complete` and `llm.stream` follows the rules of the API after a server-side fallback in the middle of an answer. The next request drops the blocks of the model that declined before the final `fallback` block: the thinking, the `connector_text`, the client `tool_use` blocks and each server tool use without a result. The loop runs only the tool uses after that block. Before, the loop sent the answer back unchanged, and the next request could fail.
- ed71c8b: `llm.stream` starts procedures as tools, as `llm.complete` does (O12). The release is a patch: the input gets new optional fields, and the new stream items come only with them. A reader that does not give `procedures` gets the same items as before.
  
  - `llm.stream` takes `procedures` and `maxRounds`, with the rules of `llm.complete`: the tools that a procedure can be, the admission and the capability of the host, a forced `toolChoice` for the first request only, the cap of 200000 characters for a tool result, and the default of 8 requests.
  - When an answer stops for its procedure tools, the stream gives a `tool_call` item and a `tool_result` item for each tool. Then the next answer streams in the same output, with its own `start` item.
  - The `stop` item comes once, at the end. Its `usage` is the sum of all the requests, and its `text` has the text of all the answers. With `procedures`, it also has `toolCalls`, `rounds` and `roundLimit`.
  - The next request has each content block of a streamed answer, with the thinking signatures and the citations.
  - `llm.stream` is data-driven (`markDataDriven`), as `llm.complete` is. The host examines each nested call with its capability and its expose rule.
  - The two procedures use one loop, `toolLoop` of `src/loop.ts`. Each request of the loop gets the automatic retry.
  - Fix for `llm.complete` and `llm.stream`: the abort of the signal stops the wait for a tool at once, with `ABORTED`. Before, the call waited for a tool that did not read the signal.
  - The new types are `LlmStreamToolCall` and `LlmStreamToolResult`. `LlmToolInput` has `procedures` and `maxRounds`.
- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0
  - @procedures/http@0.8.0
  - @procedures/json@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0
  - @procedures/http@0.7.0
  - @procedures/json@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [f3e23e3]
  - @procedures/json@0.6.0
  - @procedures/client@0.6.0
  - @procedures/http@0.6.0

## 0.5.0

### Minor Changes

- 11f9aa9: Streaming, tool use and an automatic retry for the procedures of `@procedures/llm`:
  
  - The new procedure `llm.stream` sends the request with `"stream": true`. It gives the server-sent events of the Messages API as stream items: `start`, `text`, `tool_use` and `stop`. The `stop` item has the stop reason, the usage and the full text. `sseEvents` of `@procedures/http` parses the stream. The procedure declares `streaming: true` and `stream: { unbounded: false }`.
  - `llm.complete` and `llm.stream` take `tools` (name, description, input schema, strict) and `toolChoice`. The output gives each `tool_use` block.
  - With `procedures`, `llm.complete` gives the model the named procedures as tools. It calls each one through `ctx.client`, sends the `tool_result` back, and asks again until the model stops. `maxRounds` (default 8) ends the loop. The output has `toolCalls`, `rounds` and `roundLimit`.
  - `llm.complete` is data-driven (`markDataDriven`), so the host examines each nested call with its capability and its expose rule. A refused procedure gives `FORBIDDEN` or `NOT_EXPOSED` before a request goes out.
  - A request that fails with `retryable: true` (408, 409, 429, 529 and the other 5xx statuses, a connection error, an early error event of a stream) gets new tries. The wait is the `retry-after-ms` or `retry-after` header, or `backoffDelay` of `@mark1russell7/service/backoff`. The deadline stops the retry, and a stream tries again only before its first item.
  - The input `retries` (0 to 10, default 2) of `llm.complete` and `llm.stream` sets the new tries. `retries: 0` turns them off. `llm.structured` keeps `retries` for the answers that are not valid, and gets `requestRetries`.
  - `createLlmModule()` takes `retries` and `backoff`. `LlmError` has `retryAfterMs` and the new code `BAD_TOOL`.
  - `timeoutMs` limits each request to the API.

### Patch Changes

- 0f75644: The dependencies go to `@mark1russell7/algebra` `^0.7.0` and `@mark1russell7/service` `^0.4.1`. A host that uses algebra 0.7.0 gets one copy of it. Algebra 0.7.0 only adds to 0.6.0.
- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0
  - @procedures/http@0.5.0
  - @procedures/json@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/json@0.4.0

## 0.3.0

### Minor Changes

- b2175e8: The new package `@procedures/llm` (roadmap R46) has two procedures on the Anthropic Messages API: `llm.complete` (a prompt and a system text, the model, the token limit, the temperature and the effort, and it gives the text and the usage) and `llm.structured` (a prompt and a JSON Schema, and it gives a value that the schema accepts). Each one declares `reads: ["network"]` and `writes: ["network"]`, because a call sends data out and costs money.
  
  The API key comes from the environment variable that the module names (default `ANTHROPIC_API_KEY`), not from the input. The default model is `claude-sonnet-5-5`. A call stops at the earliest of `timeoutMs`, the deadline of its capability and the abort of the caller.
  
  `llm.structured` uses the structured outputs of the API by default, without the keywords that the API does not support, and examines the value against the full schema with `validateJson` of `@procedures/json`. An answer that is not JSON, or that the schema refuses, gets at most 2 new tries. `createLlmModule({ apiKeyEnv, defaultModel, baseUrl, fallback, fetch, env })` gives the procedures with other settings.

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [a6b01a9]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
  - @procedures/json@0.3.0
