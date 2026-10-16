---
"@procedures/llm": minor
---

The new package `@procedures/llm` (roadmap R46) has two procedures on the Anthropic Messages API: `llm.complete` (a prompt and a system text, the model, the token limit, the temperature and the effort, and it gives the text and the usage) and `llm.structured` (a prompt and a JSON Schema, and it gives a value that the schema accepts). Each one declares `reads: ["network"]` and `writes: ["network"]`, because a call sends data out and costs money.

The API key comes from the environment variable that the module names (default `ANTHROPIC_API_KEY`), not from the input. The default model is `claude-sonnet-5-5`. A call stops at the earliest of `timeoutMs`, the deadline of its capability and the abort of the caller.

`llm.structured` uses the structured outputs of the API by default, without the keywords that the API does not support, and examines the value against the full schema with `validateJson` of `@procedures/json`. An answer that is not JSON, or that the schema refuses, gets at most 2 new tries. `createLlmModule({ apiKeyEnv, defaultModel, baseUrl, fallback, fetch, env })` gives the procedures with other settings.
