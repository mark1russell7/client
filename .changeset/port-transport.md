---
"@procedures/client": minor
---

The transport over a message port (roadmap R27). `PortTransport` sends calls over a Web Worker, a `MessageChannel` or a `worker_threads` port, in the two directions, with the frames of the WebSocket transport: streams with credit, cancel and errors. Its `serve` option takes a `RequestHandler`, for example a `ProcedureServer`. The site uses it for its two workers in place of two protocols of its own.
