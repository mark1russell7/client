---
"@procedures/client": minor
---

One trace from the client to the handler (roadmap R16). The tracing middleware makes W3C ids by default and sends a W3C `traceparent` in the metadata (and as the HTTP header `traceparent`). The tracing interceptor of a server continues that trace: the span of a call of the host has the trace of the client and the span of the client as its parent (`remoteParent: true`). The nested calls of a handler carry its span, also to a remote server. The spans of the interceptor have W3C ids. Before, the client and the server made two traces that nothing joined.
