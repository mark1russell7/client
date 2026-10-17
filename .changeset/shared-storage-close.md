---
"@procedures/client": patch
---

`ProcedureServer.useStorage` with `close` keeps an old storage open while another collection still uses it. The server closes it when the last collection leaves it. Before, the close broke the calls of the other collection.
