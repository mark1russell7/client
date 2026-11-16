---
"@procedures/client": minor
"@procedures/mcp-server": minor
---

The MCP face puts the untrusted text of an output in envelopes at each depth of the output, also when the text comes from a nested call.

- The invocation marks each output object of a procedure with `metadata.untrusted`. The mark goes with the object and does not change its value. The HTTP and WebSocket faces give the same output as before.
- The output check of a caller keeps the marks: each object of the checked output gets the mark of the object at the same path.
- The new exports `markUntrusted()` and `untrustedMarkOf()` of `@procedures/client` set and read the mark.
- The MCP face finds the marked fields in the output of `client.chain`, of a procedure of `procedure.define` and of a procedure of code that gives the output of another procedure.
- The first block of the answer has the data without these fields. The second block has their texts in envelopes. The attribute `field` of each envelope gives the path of its field, for example `pages.0.web_content`.
- In the structured content, each text of a nested field is in its envelope, and the shape of the field does not change. Thus the structured content agrees with the output schema of the tool.
- A field that the tool declares keeps its old form.

## Break

A code caller of an MCP tool gets each nested untrusted string of the structured content in its envelope, not as the raw text.

Migration for the site and each app:

1. Find each MCP client that reads a nested field of the structured content, where a nested procedure declares that field untrusted.
2. Read the text inside the envelope, or read the output of the procedure over HTTP or WebSocket, which has the raw text.

```typescript
// Before: the raw text
const text = result.structuredContent.pages[0].web_content[0].text;
// After: the text is in its envelope
const sealed = result.structuredContent.pages[0].web_content[0].text; // "<untrusted-content ...>...</untrusted-content>"
```
