# @procedures/http

## 0.47.0

### Patch Changes

- Updated dependencies [2f0c7b0]
  - @procedures/client@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [10dcc3c]
  - @procedures/client@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [fbb50fa]
- Updated dependencies [845902b]
- Updated dependencies [70b2245]
  - @procedures/client@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [4dada47]
- Updated dependencies [19b7a25]
  - @procedures/client@0.44.0

## 0.43.0

### Patch Changes

- @procedures/client@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [7ca9953]
- Updated dependencies [226ae02]
- Updated dependencies [e4cb0cf]
  - @procedures/client@0.42.0

## 0.41.1

### Patch Changes

- Updated dependencies [69cee92]
  - @procedures/client@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies [37deb07]
- Updated dependencies [fc52431]
  - @procedures/client@0.41.0

## 0.40.0

### Patch Changes

- @procedures/client@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [55d1e4d]
  - @procedures/client@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [c6fba49]
  - @procedures/client@0.38.0

## 0.37.0

### Patch Changes

- @procedures/client@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [f1fae86]
  - @procedures/client@0.36.0

## 0.35.1

### Patch Changes

- Updated dependencies [9f0405d]
- Updated dependencies [f5c2407]
  - @procedures/client@0.35.1

## 0.35.0

### Patch Changes

- @procedures/client@0.35.0

## 0.34.0

### Patch Changes

- fa1a61a: Less boilerplate in each procedure definition (dedupe review F1, tracker item O58).
  
  PATCH (pre-1.0): this change adds exports and deprecates names. It removes no export and changes no behavior.
  
  - `@procedures/client` has the new export `typed<T>()`. It is the one pass-through schema that gives only the type `T`.
  - `@procedures/client` has the new export `definePackage(name, procedures, requires?)`. It gives `{ module, register }` and registers nothing at the call. The new type `PackageDefinition` is its result.
  - `zodAdapter` is deprecated. `input()` and `output()` take each Standard Schema and infer its type, so a zod schema goes in directly.
  - `typedAnySchema` and `outputSchema` are deprecated. Use `typed<T>()`. They give the same pass-through schema.
  - The procedures of the packages give their zod schemas to `input()` and `output()` directly. The `.build() as AnyProcedure` casts are gone. The schemas, the types of the exports and the validation do not change.
  - `mark procedure new` writes `.input(<Name>InputSchema)` and `.output(<Name>OutputSchema)`, without `zodAdapter`.
  
  Migration:
  
  - The site, MiniMongo, Graph and jarvis: no change at this time. The deprecated names work until the next MINOR.
  - Before the next MINOR, replace `zodAdapter<T>(schema)` with `schema`. To keep the check of a schema against a type, write `const schema: z.ZodType<T> = ...`.
  - Before the next MINOR, replace `typedAnySchema<T>()` and `outputSchema<T>()` with `typed<T>()`.
  - A parse-only object (`{ parse }`) in `zodAdapter` becomes a Standard Schema with a `~standard` property.
- Updated dependencies [d4376c2]
- Updated dependencies [fa1a61a]
  - @procedures/client@0.34.0

## 0.33.0

### Patch Changes

- @procedures/client@0.33.0

## 0.32.0

### Patch Changes

- @procedures/client@0.32.0

## 0.31.0

### Patch Changes

- @procedures/client@0.31.0

## 0.30.0

### Patch Changes

- @procedures/client@0.30.0

## 0.29.0

### Minor Changes

- fa26063: The default modules refuse a loopback, private or link-local host through the host policy (audit pass 2, roadmap O55, findings 12 and 32, decision D35).
  
  MINOR: a break. Before, `weather.forecast` and the `mcpHostModules` of `geo` and `ics` sent a request to such a host with the global `fetch`. Version 0.28 gave a `DeprecationWarning` for it. Now the request gets `FORBIDDEN` with the reason `host-not-allowed`, and the host gets no request.
  
  - `weather.forecast` of the default `weatherModule` refuses a `baseUrl` on a loopback, private or link-local address. The warning `PROCEDURES_WEATHER_PRIVATE_HOST` goes away.
  - The `mcpHostModules` of `@procedures/bundle-assistant` refuse such a `baseUrl` of `geo.geocode` and `geo.route`, and such a feed of `ics.fetch`. The warnings `PROCEDURES_GEO_PRIVATE_HOST` and `PROCEDURES_ICS_PRIVATE_HOST` go away. The dev-tools server uses these modules.
  - `createHostFetch()` of `@procedures/http` loses the deprecated option `warnOnRefusal`. A refused host always throws.
  - The default modules of `geo` and `ics` do not change. They keep the global `fetch`, because their roots run in a browser.
  
  Migration:
  
  - A host that sends `weather.forecast` to its own Open-Meteo server on such an address gives a `fetch` that allows it: `createRegistry(createWeatherModule({ fetch: createHostFetch({ allow: ["10.0.0.5:8080"] }) }))`.
  - A host with a private Nominatim, OSRM or calendar server gives `createGeoModule({ fetch: createHostFetch({ allow: [...] }) })` or `createIcsModule({ fetch: createHostFetch({ allow: [...] }) })` to `createRegistry()` before the bundle.
  - A host that gave `warnOnRefusal` to `createHostFetch()` removes it, and puts the host in `allow`.
  - The site: no change. It does not call `weather.forecast`, `geo.*` or `ics.fetch` through a registry of Node.
  - MiniMongo and Graph: no change. They do not use these procedures.
  - jarvis: no change. `packages/pipeline` calls the function `geocode()` of `@procedures/geo`, not the procedure, so the host policy does not apply.

### Patch Changes

- @procedures/client@0.29.0

## 0.28.1

### Patch Changes

- 21dc858: Fixes for the security findings of the second code audit (roadmap O55).
  
  PATCH: bug fixes and additive options. Each fix refuses only an input that the documentation does not give. A caller that uses the documented behavior sees no change. A request to a loopback, private or link-local host still works, with a deprecation notice. Version 0.29.0 refuses it (decision D35).
  
  - `procedure.delete` and `procedure.define` of `@procedures/client` obey the expose rule of the host, as `procedure.get` does (R17). `procedure.delete` does not find a hidden procedure, and `procedure.define` refuses to replace one with `NOT_EXPOSED`. A new procedure at a free path stays possible, as before. Before, a caller could remove or replace a hidden procedure that the host defined.
  - The task store of `@procedures/mcp-server` keeps a task without a session (stdio, an SDK transport) apart from the HTTP sessions, both ways. Before, each HTTP session could list, read and cancel such a task.
  - `restic.run` of `@procedures/restic` refuses each input that lets the caller choose a program for restic to start: `--from-password-command`, `--password-command2`, an extended option that sets `sftp.command`, `sftp.args`, `rclone.program` or `rclone.args` (each spelling), an sftp or rclone repository whose host or remote starts with `-`, and a positional argument that starts with `-` after a last flag without a value. Before, only `--password-command` was refused.
  - `@procedures/http` exports `createHostFetch(options)`: a `fetch` for GET requests through the host policy, with the options of `createHttpModule()`. It also exports `httpSettings(options)`. The deprecated option `warnOnRefusal` keeps a refused host working: the process gets one `DeprecationWarning`, and the request goes through the global `fetch`.
  - `weather.forecast` of `@procedures/weather` sends its request through `createHostFetch()` with `warnOnRefusal`. A `baseUrl` on a loopback, private or link-local address still works, with the warning `PROCEDURES_WEATHER_PRIVATE_HOST`. `createWeatherModule({ fetch })` gives another `fetch`, for a server of the host on such an address.
  - `@procedures/geo` and `@procedures/ics` add `createGeoModule({ fetch })` and `createIcsModule({ fetch })`. Their default stays the global `fetch`, because their roots run in a browser. A refusal of the host policy keeps its code and its reason. The refusal of `ics.fetch` does not name the feed address.
  - `@procedures/bundle-assistant` exports `mcpHostModules`: the modules of `geo` and `ics` with `createHostFetch()` and `warnOnRefusal`. A refused host gets the warning `PROCEDURES_GEO_PRIVATE_HOST` or `PROCEDURES_ICS_PRIVATE_HOST`. The bundle keeps the default modules, so `mark` and the site load it next to `geo` and `ics` as before.
  - The dev-tools server of `@procedures/mcp-dev-tools` gives the `mcpHostModules` of each bundle to `createRegistry()` before the bundles. In one call, the first module of a name counts. Thus `geo.geocode`, `geo.route`, `weather.forecast` and `ics.fetch` of the dev-tools server go through the default host policy.
  
  A host that sends `weather.forecast`, or the bundle's `geo` tools, to a server on a private address can remove the warning now. It gives a `fetch` that allows the server: `createWeatherModule({ fetch: createHostFetch({ allow: ["10.0.0.5:8080"] }) })`. This `fetch` refuses each other private host now, as 0.29.0 does by default.
- Updated dependencies [345c740]
- Updated dependencies [984c13b]
- Updated dependencies [21dc858]
  - @procedures/client@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [06694d7]
  - @procedures/client@0.28.0

## 0.27.8

### Patch Changes

- Updated dependencies [1834a5e]
  - @procedures/client@0.27.8

## 0.27.7

### Patch Changes

- @procedures/client@0.27.7

## 0.27.6

### Patch Changes

- Updated dependencies [d322bef]
  - @procedures/client@0.27.6

## 0.27.5

### Patch Changes

- @procedures/client@0.27.5

## 0.27.4

### Patch Changes

- Updated dependencies [8970a1e]
  - @procedures/client@0.27.4

## 0.27.3

### Patch Changes

- @procedures/client@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1

## 0.24.0

### Patch Changes

- @procedures/client@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1

## 0.22.0

### Patch Changes

- @procedures/client@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0

## 0.17.4

### Patch Changes

- @procedures/client@0.17.4

## 0.17.3

### Patch Changes

- @procedures/client@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1

## 0.17.0

### Patch Changes

- @procedures/client@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
  - @procedures/client@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1

## 0.12.0

### Patch Changes

- @procedures/client@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/client@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0

## 0.4.0

### Minor Changes

- ff87747: `http.ndjson` and `http.sse` send a POST too. Their inputs have `method` (`GET` or `POST`), `json` (a body of JSON) and `body` (a body of text), as `http.request` has them. The default method is `POST` with a body, and `GET` without one. An LLM API sends its answer to a POST as server-sent events: `http.sse` now reads such a stream.
  
  A POST of a stream gets the host check, the size limit of the request body, `timeoutMs`, `idleTimeoutMs` and the deadline of the call. Two bodies, or a `GET` with a body, fail before the request.
  
  A POST can change remote data, so the two streams now declare `writes: ["network"]`, as `http.json` does. Before, they declared `writes: []`.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0

## 0.3.0

### Minor Changes

- a6b01a9: The new package `@procedures/http` (roadmap R38) has four procedures: `http.request` (each method, a body of text, JSON or base64, and a response as text, JSON or base64), `http.json` (a GET or a POST of JSON), `http.ndjson` (a stream of the JSON values of the lines) and `http.sse` (a stream of server-sent events). `http.request` and `http.json` declare `reads: ["network"]` and `writes: ["network"]`. The two streams send only a GET, so they declare `writes: []`, and they declare `stream: { unbounded: true }`.
  
  The default module reaches each public host and refuses loopback, private, link-local, shared, multicast and reserved addresses. `createHttpModule({ allow, publicHosts, maxRequestBytes, maxResponseBytes, resolve })` gives the procedures with more hosts: host names, wildcards, IP addresses and CIDR ranges, each with an optional port. The check resolves the host name, and the connection uses only the addresses that passed the check. Each redirect gets the same check. A refusal has the code `FORBIDDEN` and the new reason `host-not-allowed` (the type `ForbiddenReason` of `@procedures/client`).
  
  A call stops at the earliest of its deadline, the abort of the caller and `timeoutMs`. A stream also stops after `idleTimeoutMs` without data. The body of a response has a limit of 10 MiB by default, and the limit counts the decoded bytes of a compressed body.

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
