---
"@procedures/peer": minor
"@procedures/server": minor
"@procedures/mcp-dev-tools": minor
---

`@mark1russell7/service` is a peer dependency of `@procedures/peer`, `@procedures/server` and `@procedures/mcp-dev-tools` (CLI-117).

Service keeps some state for each copy of the package, keyed by an object. A lifecycle keys its drains, and an HTTP answer keys its owner. The public API of these three packages takes or gives such values. With two copies of service, a builder of one copy does not see the drains of the other copy. The peer gives the app and these packages one copy.

The packages that pass only plain shapes (a clock, a backoff) keep service as a plain dependency. A new check (`scripts/check-identity-peers.ts`) examines each package. It fails when a package passes an identity value of service and service is not its peer.

Migration:

1. Add `@mark1russell7/service` (`^0.8.3`) to the `dependencies` of each app that uses one of these packages.
2. npm 7 and later and pnpm 8 and later install a missing peer. Step 1 makes the version of the app explicit.
3. An app that links service from its own workspace gets the linked copy in these packages too. No other change is necessary.
4. The `npx procedure-server` and `npx mcp-dev-tools` commands work as before: npm installs the peer.
