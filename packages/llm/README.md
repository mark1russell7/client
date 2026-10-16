# @procedures/llm

[![npm](https://img.shields.io/npm/v/@procedures/llm?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/llm)

```sh
npm install @procedures/llm
```

A language model as procedures: a completion, and a structured answer that a JSON Schema accepts. The procedures send each request to the Anthropic Messages API.

## The procedures

| Procedure | What it does | Effects |
|---|---|---|
| `llm.complete` | It sends a prompt and a system text, and gives the text, the model, the stop reason and the usage. | reads and writes `network` |
| `llm.structured` | It sends a prompt and a JSON Schema, and gives a value that the schema accepts. | reads and writes `network` |

- Each procedure declares `reads: ["network"]` and `writes: ["network"]`, with `destructive: false` and `idempotent: false`. A call sends data out of the host and costs money.
- The input has `prompt`, `system`, `model`, `maxTokens`, `temperature`, `effort`, `timeoutMs` and `fallback`.
- The default model is `claude-sonnet-5-5`. The default of `maxTokens` is 16000, and the limit counts the tokens of the thinking too.
- Some models accept only the default temperature. For such a model, the API refuses another value with an error.
- The text of `llm.complete` is the text blocks of the answer, joined. The thinking blocks are not in it.

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

- Each call has `timeoutMs`. The default is 10 minutes, and the maximum is 1 hour.
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

## Errors

| Error | Code | Cause |
|---|---|---|
| `LlmError` | `NO_API_KEY` | The variable of the key has no value. |
| `LlmError` | `API_ERROR` | The API answered with an error status. `status` has it, and `retryable` is true for 408, 409, 429 and 5xx. |
| `LlmError` | `CONNECTION` | The connection failed. `retryable` is true. |
| `LlmError` | `BAD_RESPONSE` | The answer of the API is not a message. |
| `LlmError` | `REFUSAL` | A safety classifier declined the request. |
| `LlmError` | `MAX_TOKENS`, `INVALID_OUTPUT` | `llm.structured` got no valid value. |
| `InvocationError` | `TIMEOUT`, `ABORTED` | The time limit, the deadline or the abort of the caller stopped the call. |

The procedures do not try a failed request again. The caller decides, with `retryable`.

## MCP

These procedures are not in a bundle of MCP tools. A call costs money and sends data out of the host. A host that gives them to Claude adds them on purpose.

## Tests

`pnpm --filter @procedures/llm test` examines the procedures with a fake `fetch`. No test sends a request to the network.
