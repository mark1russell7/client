# @procedures/llm

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
