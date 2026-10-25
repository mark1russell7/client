---
"@procedures/client": patch
"@procedures/mcp-server": patch
"@procedures/restic": patch
"@procedures/http": patch
"@procedures/weather": patch
"@procedures/geo": patch
"@procedures/ics": patch
"@procedures/bundle-assistant": patch
"@procedures/mcp-dev-tools": patch
---

Fixes for the security findings of the second code audit (roadmap O55).

PATCH: bug fixes and additive options. Each fix refuses only an input that the documentation does not give. A caller that uses the documented behavior sees no change.

- `procedure.delete` and `procedure.define` of `@procedures/client` obey the expose rule of the host, as `procedure.get` does (R17). `procedure.delete` does not find a hidden procedure, and `procedure.define` refuses to replace one with `NOT_EXPOSED`. A new procedure at a free path stays possible, as before. Before, a caller could remove or replace a hidden procedure that the host defined.
- The task store of `@procedures/mcp-server` keeps a task without a session (stdio, an SDK transport) apart from the HTTP sessions, both ways. Before, each HTTP session could list, read and cancel such a task.
- `restic.run` of `@procedures/restic` refuses each input that lets the caller choose a program for restic to start: `--from-password-command`, `--password-command2`, an extended option that sets `sftp.command`, `sftp.args`, `rclone.program` or `rclone.args` (each spelling), an sftp or rclone repository whose host or remote starts with `-`, and a positional argument that starts with `-` after a last flag without a value. Before, only `--password-command` was refused.
- `@procedures/http` exports `createHostFetch(options)`: a `fetch` for GET requests through the host policy, with the options of `createHttpModule()`. It also exports `httpSettings(options)`.
- `weather.forecast` of `@procedures/weather` sends its request through `createHostFetch()`. The policy refuses a `baseUrl` on a loopback, private or link-local address. `createWeatherModule({ fetch })` gives another `fetch`, for a server of the host on such an address.
- `@procedures/geo` and `@procedures/ics` add `createGeoModule({ fetch })` and `createIcsModule({ fetch })`. Their default stays the global `fetch`, because their roots run in a browser. A refusal of the host policy keeps its code and its reason. The refusal of `ics.fetch` does not name the feed address.
- `@procedures/bundle-assistant` exports `mcpHostModules`: the modules of `geo` and `ics` with `createHostFetch()`. The bundle keeps the default modules, so `mark` and the site load it next to `geo` and `ics` as before.
- The dev-tools server of `@procedures/mcp-dev-tools` gives the `mcpHostModules` of each bundle to `createRegistry()` before the bundles. In one call, the first module of a name counts. Thus `geo.geocode`, `geo.route`, `weather.forecast` and `ics.fetch` of the dev-tools server go through the default host policy.

A host that sends `weather.forecast`, or the bundle's `geo` tools, to a server on a private address gives a `fetch` that allows it: `createWeatherModule({ fetch: createHostFetch({ allow: ["10.0.0.5:8080"] }) })`.
