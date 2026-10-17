---
"@procedures/llm": patch
---

The tool loop of `llm.complete` and `llm.stream` follows the rules of the API after a server-side fallback in the middle of an answer. The next request drops the blocks of the model that declined before the final `fallback` block: the thinking, the `connector_text`, the client `tool_use` blocks and each server tool use without a result. The loop runs only the tool uses after that block. Before, the loop sent the answer back unchanged, and the next request could fail.
