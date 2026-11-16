---
"@procedures/client": patch
"@procedures/mcp-server": patch
---

The MCP face puts the untrusted text of an output in envelopes at each depth of the output, also when the text comes from a nested call.

- The invocation marks each output object of a procedure with `metadata.untrusted`. The mark goes with the object and does not change its value. The HTTP and WebSocket faces give the same output as before.
- The output check of a caller keeps the marks: each object of the checked output gets the mark of the object at the same path.
- The new exports `markUntrusted()` and `untrustedMarkOf()` of `@procedures/client` set and read the mark.
- The MCP face finds the marked fields in the output of `client.chain`, of a procedure of `procedure.define` and of a procedure of code that gives the output of another procedure.
- The first block of the answer has the data without these fields. The second block has their texts in envelopes. The attribute `field` of each envelope gives the path of its field, for example `pages.0.web_content`.
- In the structured content, each text of a nested field is in its envelope, and the shape of the field does not change. Thus the structured content agrees with the output schema of the tool.
- A field that the tool declares keeps its old form.
