# Bug status: October 2026

> The status of every entry of [BUGS-2026-07.md](./BUGS-2026-07.md) after the monorepo move and the October cleanup.
> Commit hashes without a repository name are in this repository (`mark1russell7/client`).
> Decisions are in [DECISIONS-2026-10.md](./DECISIONS-2026-10.md).

## Summary

| Status | Count | IDs |
|---|---:|---|
| Fixed in July | 43 | C1–C7, H1–H4, H7, H10, H11, H13, H14, H16, H19, H24, H25, H27, H28, M4, M6, M7, M10–M16, M18–M21, M23, M24, M30, M35, M39, M41, L1 (H18 was referenced in July too, but only its documentation was corrected: it is fixed in October) |
| Fixed in October | 35 | see the next table |
| Fixed earlier, confirmed in October | 6 | H20, H21, M9, L27; H30 and M40 in the `logger` repository |
| Obsolete (the code was deleted) | 8 | H17, L26 (aggregation layer), L25 (`lib.pull`), M31 (`lib.refresh`), H22 (`client-server-mongo`), H23 (`client-connection`), L18, L19 (mock packages) |
| Not a bug | 1 | L20: `splay`'s own tests assert that `pathDepth("data.items[0]")` is 2 |
| Open: latent | 1 | L15 |
| Open: restored, to rebuild | 11 | C8–C12, L10, L11, L12, L14, L16, L17. The collections modules were deleted on 2026-10-08 and restored the same day. See ARCHITECTURE-PROPOSALS P8. |
| Open: needs a decision | 8 | H5, H8, H9, M2 (streaming: approved, in progress), L2, L21 (`client-logger`: retire, approved); M27, M28 (`cue`) |

## Fixed in October

| ID | Fix | Commit |
|---|---|---|
| M25 | `snapshot.diff`: commit from S3 metadata validated as hex, git run without a shell | `8fb7e4c` |
| L7 | `vitest.run`/`vitest.watch` without a shell; `watch`/`reporter` honored; `args`/`shorts` fixed | `727c00d` |
| L8 | `test.run`/`test.coverage` through `shell.run` with an argument list | `68407a6` |
| L6, L5 | git: option injection blocked (`--upload-pack` and similar), 64 MiB `maxBuffer`, remote-branch detection | `a2148a7` |
| L9 | `cli.run` finds the `mark` CLI in the workspace; positional arguments; no local re-run after a server failure | `5aca09c` |
| M34, M29, L23 | `mark`: no local re-run after a server failure; `-f`; boolean flags | `74db8d4` |
| H33 | generate keeps a package's own entry points | `afe3f4e` (`client-cue`), `3a965d5` (`cue`), `1420dcb` (lockfile) |
| M36, H32 | `cue.generate` reports `cue eval` failures; `cue` resolved as a dependency | `afe3f4e` |
| L24 | `cue.mod` link and copy without shell commands | `e737619` (`cue`) |
| H31 | `route()` passes the validated input to handlers | `038cf5b` |
| H12, M1 | `routeStream` delivers every result; `call()` closes its stream | `46e01be` |
| H6, M5, L29 | WebSocket: no reconnect after `close()`, `requestTimeout`, server-to-client requests per connection | `f7895c0` |
| L4 | `shell.run`: decodes once, caps output, reports the signal | `1bb3992` |
| M37 | `procedure.new` dry run reports the real plan | `bccb0b1` |
| L22 | registering twice no longer throws (`client-logger`, `client-splay`) | `f0fa493` |
| M33 | `ecosystem.procedures` loads packages on Windows | `8dde012` |
| L30 | MCP JSON Schema cache keyed by schema object | `6640693` |
| L28 | `client-mcp`: no listener leak; unimplemented SSE option removed | `8172dfa` |
| H29 | `client-splay`: `debounceStream` ends, `mergeStreams` keeps every item | `e5fe390` |
| M3, M8 | dead batching middlewares and wildcard collection procedures deleted | `7bdd21e` |
| L3 | namespaced child components found; generators ended | `bb4860d` |
| M17 | `MongoProcedures` uses the handlers' own types | `0a63e5e` |
| M22 | `s3.download` streams to `destPath`; in-memory downloads capped | `4015e5a` |
| H26 | `docker-sqlite`: one call at a time per file, atomic save (50 concurrent inserts kept 1 row) | `352adc9` (`docker-sqlite`), `3e509e5` (lockfile) |
| H15 | real `sideEffects` values | `50ba8b8` |
| M38 | Docker ports bound to `127.0.0.1` | `220bfa8` (`docker-mongo`), `1247930` (`docker-sqlite`) |
| M26 | MiniMongo reads the pagination fields the server sends | `1473adb` (`MiniMongo`) |
| H18 | the MCP server exposes only `bundle-mcp`'s `mcpNamespaces` (`shell.*` out, `lib.*` in, 68 tools). A data-driven procedure (`client.chain`, `eval`, a procedure that `procedure.define` made) calls only exposed procedures, so `client.chain` cannot reach `shell.exec`. Importing any client package registers its procedures | `8f8091e` |
| L13 | composite map methods go through `lruMap`/`ttlMap`. Partly real: most `HashMap` composites already called `this.set`/`this.delete` on the proxy, but `replace`, `replaceEntry` and `deleteEntry` changed the buckets directly (an LRU `replace` left the recency and the reported eviction value stale) | `9bcce4a` |

### Found and fixed in October (not in the July register)

| Defect | Commit |
|---|---|
| `lruMap` over `ttlMap` (the cache middleware's map) kept stale nodes: memory growth, size above capacity, false evictions | `c157317` |
| TTL timers kept Node processes alive | `c157317` |
| `git.log` returned an extra empty commit | `a2148a7` |
| `zodAdapter` hid the Zod schema: `mark` help showed no fields, and MCP tools had no input schemas | `f2d870c` |
| `lib.new` ran `npx` in a folder with no `node_modules` (registry download) and interpolated the preset into a shell command | `476a1cc` |
| The `client-dag` duration tests were flaky on CI (timer granularity) | `2ece668` |
| The WebSocket client wrote every request and response to stdout | `f7895c0` |
| The control-flow procedures called each operand with its raw input: a nested ref (`multiply { a: add {...} }`) reached the procedure as an object | `5ea4d5e` |
| `map` returned its raw items and `reduce` its initial value: neither applied a function. Both take `fn` now | `5ea4d5e` |
| 85 of the 100 core procedures (math, string, array, object, comparison, type, meta) were not reachable outside the package: `allCoreProcedures` was not exported | `1b158b1` |
| `client.eval` called handlers from the global registry with its own context, without input validation | `8f8091e` |

## Open

**Latent** (the only consumer is not affected):

- L15: `HashMap` has no modification count, so an iterator does not fail fast when the map changes during iteration.

**Needs a decision** (the options are in the architecture proposals): H9 and H5 (streaming handlers and WebSocket streaming), H8 (`out:` configuration), M2 (retry buffers streams), L2 (route-leaf detection), L21 (`client-logger`: retire, or validate the inputs), M27 and M28 (`cue` generator: the per-package `pnpm` field, and a `vitest` feature with no CUE file).
