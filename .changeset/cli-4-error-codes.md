---
"@procedures/client": minor
---

Each face gives only the error codes of wire v1 (server stack CLI-4). The stray codes fold into `UNAVAILABLE`, `FORBIDDEN` and `INTERNAL_ERROR`. This change is a break of the server stack, thus it is its own MINOR (decision D13).

Before, `procedureHandler` gave the codes of wire v1, but other paths kept their former codes. `HttpServerTransport` answered `SERVER_STOPPED` after `stop()`. The browser checks gave `FORBIDDEN_HOST`, `FORBIDDEN_ORIGIN`, `METHOD_NOT_ALLOWED` (405) and `UNSUPPORTED_MEDIA_TYPE` (415). `Server` and `ServerError` gave the code `"500"`.

The behavior that changes:

| Former code | Former status | Code of wire v1 | Status | Reason |
|---|---|---|---|---|
| `SERVER_STOPPED` | 503 | `UNAVAILABLE` | 503 | — |
| `FORBIDDEN_HOST` | 403 | `FORBIDDEN` | 403 | `host-header-not-allowed` |
| `FORBIDDEN_ORIGIN` | 403 | `FORBIDDEN` | 403 | `origin-not-allowed` |
| `METHOD_NOT_ALLOWED` | 405 | `FORBIDDEN` | 403 | `method-not-allowed` |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | `FORBIDDEN` | 403 | `media-type-not-allowed` |
| `"500"` | 500 | `INTERNAL_ERROR` | 500 | — |

- `HttpServerTransport` answers a request after `stop()` with `UNAVAILABLE` (503, retryable), as `procedureHandler` does. The message is "The server is stopping".
- `HttpServerTransport` refuses a browser request with `FORBIDDEN` (403) and the field `reason` in the body, as `procedureHandler` does. A `GET` without `allowGet` and a body that is not JSON get 403, not 405 or 415.
- `checkBrowserRequest()` gives `{ ok: false, status: 403, code: "FORBIDDEN", reason, message }`. The type `GuardResult` has the new field `reason`. The MCP endpoint of `@procedures/mcp-server` uses it, so its refusal has `data.code` `FORBIDDEN`.
- `Server` answers an error outside a handler with `INTERNAL_ERROR`. `new ServerError(message)` has the default code `INTERNAL_ERROR`.
- The message of the refusals of the method and of the body starts with "Forbidden:".

For one release, the client reads the former codes of an older server:

- `HttpTransport` and the WebSocket transports read `SERVER_STOPPED` as `UNAVAILABLE` and `"500"` as `INTERNAL_ERROR`.
- `HttpTransport` reads `FORBIDDEN_HOST` and `FORBIDDEN_ORIGIN` as `FORBIDDEN`, and sets the metadata key `reason`.
- `isAvailabilityFailure()` still counts `SERVER_STOPPED`.
- The client keeps `METHOD_NOT_ALLOWED` and `UNSUPPORTED_MEDIA_TYPE`. They are also the codes of the HTTP statuses 405 and 415 of each server.
- The next breaking release of the client group removes these aliases.

Migration steps:

- Code that matches `SERVER_STOPPED`: match `UNAVAILABLE`. The flag `retryable` stays true.
- Code that matches `FORBIDDEN_HOST` or `FORBIDDEN_ORIGIN`: match `FORBIDDEN`, then read `reason` (the body field, or the metadata key `reason`).
- Code that matches the status 405 or 415 of a procedure server: match the status 403 and the reasons `method-not-allowed` and `media-type-not-allowed`.
- Code that reads `GuardResult.code` of `checkBrowserRequest()`: read `reason`.
- Code that matches the code `"500"` or the default code of `ServerError`: match `INTERNAL_ERROR`.
- The site, MiniMongo, Graph and jarvis: no code of theirs matches a former code, so no change is necessary.
- MiniMongo: its dev server uses `HttpServerTransport`, and its answers change only as the table says.
- jarvis: its host uses `procedureHandler`, which gave the codes of wire v1 already.
