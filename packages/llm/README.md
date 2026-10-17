# @procedures/llm

[![npm](https://img.shields.io/npm/v/@procedures/llm?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/llm)

```sh
npm install @procedures/llm
```

A language model as procedures: a completion, a stream of the answer, and a structured answer that a JSON Schema accepts. The procedures send each request to the Anthropic Messages API.

## The procedures

| Procedure | What it does | Effects |
|---|---|---|
| `llm.complete` | It sends a prompt and a system text, and gives the text, the model, the stop reason and the usage. The model can use tools and procedures. | reads and writes `network` |
| `llm.stream` | It sends the same request with `"stream": true`, and gives the events of the answer as stream items. | reads and writes `network` |
| `llm.structured` | It sends a prompt and a JSON Schema, and gives a value that the schema accepts. | reads and writes `network` |

- Each procedure declares `reads: ["network"]` and `writes: ["network"]`, with `destructive: false` and `idempotent: false`. A call sends data out of the host and costs money.
- The input has `prompt`, `system`, `model`, `maxTokens`, `temperature`, `effort`, `timeoutMs` and `fallback`.
- The default model is `claude-sonnet-5-5`. The default of `maxTokens` is 16000, and the limit counts the tokens of the thinking too.
- Some models accept only the default temperature. For such a model, the API refuses another value with an error.
- The text of `llm.complete` is the text blocks of the last answer, joined. The thinking blocks are not in it.

```ts
import "@procedures/llm/register";

const { text, usage } = await client.call(["llm", "complete"], { prompt: "Name three prime numbers.", effort: "low" });

const { value } = await client.call(["llm", "structured"], {
  prompt: "Ada Lovelace, born 1815",
  schema: { type: "object", properties: { name: { type: "string" }, born: { type: "integer" } }, required: ["name", "born"] },
});
```

## The API key

The key comes from an environment variable. The default variable is `ANTHROPIC_API_KEY`. An input cannot give a key, and the procedures remove each field that the input schema does not have.

- A variable without a value gives the error `NO_API_KEY`, before a request goes out.
- An error message does not contain the key.
- The procedures send the request with `fetch`, not through `http.request`. The input of a nested call is visible to the interceptors and to the traces of the host, and the key is in a header.

## Streaming

`llm.stream` sends the request with `"stream": true` and reads the server-sent events of the answer. `sseEvents` of `@procedures/http` parses the event stream. Each item has a `type`:

| Item | Event of the API | Fields |
|---|---|---|
| `start` | `message_start` | `id`, `model`, and the `usage` at the start: the tokens of the input |
| `text` | `content_block_delta` with `text_delta` | `index` of the content block, and the new `text` |
| `tool_use` | `content_block_stop` of a `tool_use` block | `index`, `id`, `name`, and the parsed `input` |
| `stop` | `message_stop` | `model`, `stopReason`, the full `usage`, the full `text` and the `toolUses` |

```ts
for await (const item of client.stream(["llm", "stream"], { prompt: "Write a haiku." })) {
  if (item.type === "text") process.stdout.write(item.text);
}
```

- The stream has the key rule, the injectable `fetch`, the time limit, the deadline and the abort of the other procedures.
- The usage of a `message_delta` event is cumulative. The `stop` item has the last value.
- `client.call` of a stream gives its last item. For `llm.stream`, that is the `stop` item, with the full text.
- The procedure ignores the `ping` events, the thinking deltas and the event types that it does not know.
- A `tool_use` item gives `input: null` and the text in `partialJson` when the JSON of the input does not parse. An answer that stops at `maxTokens` can do this.
- After a server-side fallback, the `stop` item gives the fallback model.
- An `error` event gives `API_ERROR`. An overload, a rate limit and a server error are retryable.
- A stream that ends before `message_stop` gives `CONNECTION`, with `retryable: true`.
- A refusal at the end of the stream gives `REFUSAL`, as in `llm.complete`.
- The procedure declares `streaming: true` and `stream: { unbounded: false }`. The answer ends: `maxTokens` and `timeoutMs` limit it.

## Tools

`llm.complete` and `llm.stream` take `tools` and `toolChoice`.

- Each tool has `name`, `description`, `inputSchema` and `strict`. The name has 1 to 128 letters, digits, `_` and `-`. The API gets the schema as `input_schema`.
- `toolChoice` is `{ type: "auto" }` (the default), `{ type: "any" }`, `{ type: "tool", name }` or `{ type: "none" }`. The API gets it as `tool_choice`.
- `disableParallelToolUse: true` on `auto`, `any` or `tool` lets the model use at most one tool in an answer.
- The output of `llm.complete` gives each `tool_use` block of the answer in `toolUses`: `id`, `name` and `input`. The caller starts these tools.
- Claude Sonnet 5.5, Claude Opus 5.5 and Claude Fable 5.1 refuse `any` and `tool` with a 400 error. For these models, use `auto`, a clear prompt and `strict: true`.
- Two tools with the same name, a `toolChoice` without tools, and a `toolChoice` with an unknown name give `BAD_TOOL`, before a request goes out.

## Procedures as tools

With `procedures`, `llm.complete` starts the tools itself. The input names the keys of the procedures, for example `weather.current`.

```ts
const { text, toolCalls, rounds } = await client.call(["llm", "complete"], {
  prompt: "What is the weather in Paris?",
  procedures: ["weather.current"],
  maxRounds: 4,
});
```

1. Each procedure becomes a tool. The name is the key with `_` in place of each `.`, for example `weather_current`.
2. The description of the procedure and the JSON Schema of its input go to the API. The input of the procedure must be an object.
3. When the model asks for a tool, `llm.complete` starts the procedure through `ctx.client` with the input of the model.
4. The output goes back as a `tool_result`, and the next request has the answer and the results.
5. The loop continues until the model stops, or until `maxRounds` requests went out. The default of `maxRounds` is 8, and the maximum is 64.

The output has these fields:

| Field | Meaning |
|---|---|
| `toolCalls` | Each procedure call: `id`, `name`, `procedure`, `input`, `isError`, and `output` or `error` |
| `rounds` | The number of requests to the model |
| `roundLimit` | True when `maxRounds` stopped the loop. Then `stopReason` is `tool_use`, and `toolUses` has the blocks that no procedure got. |
| `usage` | The tokens of all the requests |

- The procedures run one at a time, in the sequence of the answer. All the results of one answer go back in one message.
- An error of a procedure goes to the model as a `tool_result` with `is_error: true`. An input that the schema refuses gives `VALIDATION_ERROR` there. The model can try again.
- A forced `toolChoice` (`any` or `tool`) applies to the first request only. The next requests use `auto`, so the model can stop.
- When an answer asks for a tool of `tools` too, no procedure runs. The output gives all the `tool_use` blocks.
- A `tool_result` has at most 200000 characters of the output. A longer output gets a note with its length.
- A procedure without an end (`stream: { unbounded: true }`) gives `BAD_TOOL`.

### The admission of the host

`llm.complete` is a data-driven procedure (`markDataDriven` of `@procedures/client`), because its input chooses its callees. Thus the host examines each nested call, as it examines the calls of `client.chain`.

- The capability of the call applies to each procedure tool. A host that permits only `writes: ["network"]` permits only read-only tools.
- The expose rule of the host applies too. A host with `expose` lets the model call only the procedures that it exposes.
- Before the first request, `llm.complete` examines each named procedure with the same rules. A refused procedure gives `FORBIDDEN` or `NOT_EXPOSED`, and no request goes out.
- A procedure that is not in the registry gives `NOT_FOUND`. A refused path tells nothing about the procedure.
- When the host refuses a nested call later (an interceptor can narrow the capability), the call stops with that error.
- The abort of the caller and the deadline also stop the call during a tool.
- The procedure is not `runs-refs`: the refs of its input still run before the call. It declares no `calls`, because its callees come from the input.

## Automatic retry

A request that fails with `retryable: true` gets a new try.

- The retryable errors are the statuses 408, 409, 429 and 5xx (529 too), a connection error, and an early error event of a stream.
- The header `x-should-retry` of the API overrides the rule of the status.
- The input `retries` of `llm.complete` and `llm.stream` sets the number of new tries, from 0 to 10. The default is 2, the default of the Anthropic SDKs. `retries: 0` turns the retry off.
- `llm.structured` has `retries` already, for the answers that are not valid. Its input `requestRetries` sets the new tries of a request.
- The wait before a try is the `retry-after-ms` or `retry-after` header. Without a header, the wait comes from `backoffDelay` of `@mark1russell7/service/backoff`.
- The default backoff starts at 500 ms, doubles each time, and stops at 8000 ms. A jitter removes up to a quarter of each wait.
- When the wait ends after the deadline of the call, or `retry-after` asks for more than 60 seconds, the call gives the error at once.
- The abort of the caller stops a wait with `ABORTED`.
- A stream tries again only before its first item. After the first item, an error goes to the caller.
- A `TIMEOUT` does not get a new try.

## Structured answers

`llm.structured` gives a value that the schema accepts, or an error.

- With `constrained: true` (the default), the API constrains the output to the schema (structured outputs).
- The structured outputs of the API do not support some keywords: `minimum`, `maximum`, `multipleOf`, `minLength`, `maxLength`, `minItems`, `maxItems` and others. The procedure removes them from the schema that the API gets, and closes each object with `additionalProperties: false`.
- After the answer, the procedure examines the value against the full schema with `validateJson` of `@procedures/json`.
- With `constrained: false`, the system text gives the schema. Use it for a schema that the API refuses, for example a recursive schema.
- An answer that is not JSON, or that the schema refuses, gets a new try. The next request has the answer, unchanged, and a user turn with the problems. The input `retries` sets the number of new tries: 0 to 2, and the default is 2.
- After the last try, the error is `INVALID_OUTPUT`. An answer that stopped at `maxTokens` gives `MAX_TOKENS` at once, because a new try with the same limit can fail again.
- The output has `attempts`, the usage of all the calls, and `unchecked`: the keywords of the schema that the check does not examine fully.

## Limits and time

- Each request to the API has `timeoutMs`. The default is 10 minutes, and the maximum is 1 hour. A stream gets the same limit for all its events.
- The deadline of the call (`ctx.capability.deadline`) and the abort of the caller (`ctx.signal`) also stop the call. The earliest event wins.
- A stop gives `TIMEOUT`, or `ABORTED` for an abort of the caller.

## Refusals and the fallback

A safety classifier can decline a request. The API then gives the stop reason `refusal`, and the procedure gives the error `REFUSAL` with the category.

With `fallback: true` (the default), the request has `fallbacks: "default"` and the beta header `server-side-fallback-2026-07-01`. The API then sends a declined request again to the fallback model that it recommends. The output gives the model that answered.

- Some models do not accept the field. For such a model, give `fallback: false` in the input, or give `fallback: false` to the module.
- The fallback is a feature of the Claude API. A proxy to another platform can refuse it.

## The module

`createLlmModule()` gives the same procedures with other settings:

```ts
import { createRegistry } from "@procedures/client";
import { createLlmModule } from "@procedures/llm/module";

const registry = createRegistry(createLlmModule({ apiKeyEnv: "WORK_ANTHROPIC_KEY", defaultModel: "claude-haiku-5-5" }));
```

| Option | Meaning |
|---|---|
| `apiKeyEnv` | The environment variable of the key. The default is `ANTHROPIC_API_KEY`. |
| `defaultModel` | The model of an input without `model`. The default is `claude-sonnet-5-5`. |
| `baseUrl` | The base URL of the API. The default is `https://api.anthropic.com`. |
| `fallback` | The default of the `fallback` input. The default is `true`. |
| `fetch` | The `fetch` of the requests. A test gives a fake one. |
| `env` | The variables: a record, or a function that gives them at each call. The default is `process.env`. |
| `retries` | The default number of new tries after a retryable error, from 0 to 10. The default is 2. |
| `backoff` | The `Backoff` policy of `@mark1russell7/service/backoff`. A test gives a short one. |

## Errors

| Error | Code | Cause |
|---|---|---|
| `LlmError` | `NO_API_KEY` | The variable of the key has no value. |
| `LlmError` | `API_ERROR` | The API answered with an error status, or a stream sent an `error` event. `status` has the status. `retryable` is true for 408, 409, 429 and 5xx. |
| `LlmError` | `CONNECTION` | The connection failed, or a stream ended before `message_stop`. `retryable` is true. |
| `LlmError` | `BAD_RESPONSE` | The answer of the API is not a message or an event stream. |
| `LlmError` | `REFUSAL` | A safety classifier declined the request. |
| `LlmError` | `BAD_TOOL` | A tool definition is not valid. |
| `LlmError` | `MAX_TOKENS`, `INVALID_OUTPUT` | `llm.structured` got no valid value. |
| `InvocationError` | `TIMEOUT`, `ABORTED` | The time limit, the deadline or the abort of the caller stopped the call. |
| `InvocationError` | `FORBIDDEN`, `NOT_EXPOSED`, `NOT_FOUND` | The host refused a procedure tool. |

`retryAfterMs` of an `LlmError` gives the wait that the API asked for.

## MCP

These procedures are not in a bundle of MCP tools. A call costs money and sends data out of the host. A host that gives them to Claude adds them on purpose.

## Tests

`pnpm --filter @procedures/llm test` examines the procedures with a fake `fetch`. The fake gives recorded JSON answers and recorded event streams. No test sends a request to the network.
