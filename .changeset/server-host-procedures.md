---
"@procedures/server": minor
"@procedures/peer": minor
---

`server.start`, `server.stop` and `server.status` moved from `@procedures/peer` to `@procedures/server`, the package of the host. Their names, schemas and effects stay the same. They manage the background server of the `mark` CLI.

In this version, `@procedures/server` has a `./module` entry, a `./register` entry and the `client.procedures` field, so `mark server start`, `mark server stop` and `mark server status` keep working. The registry of `procedure-server` and `mark serve` has the module of the peer package and the module of the server package, as before.

The module of `@procedures/peer` does not register the three procedures any more, and `@procedures/peer/procedures` does not export them. The lockfiles stay in `@procedures/peer/lockfile`.

`connect()` of `@procedures/peer` takes `WebSocketTransport` from `@procedures/client/node`, not from the root of `@procedures/client`. Thus a peer connection in Node uses the `WebSocket` class of `ws`, and a drop ends the socket at once with `terminate()`.
