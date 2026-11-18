---
"@procedures/peer": minor
"@procedures/server": minor
"@procedures/mcp-dev-tools": minor
---

Breaking change: `@mark1russell7/service` `^0.11.0` is a peer dependency of `@procedures/peer`, `@procedures/server` and `@procedures/mcp-dev-tools` (CLI-117). Before this version, each of these packages had service `^0.10.0` as a plain dependency.

Each app that uses one of these packages does one step: add `@mark1russell7/service` `^0.11.0` as its own dependency.

```sh
pnpm add @mark1russell7/service@^0.11.0
```

Service 0.11.0 is a breaking version of service. These types of the public API of the three packages change with it:

- `Lifecycle` has the new member `scope`, the service scope. Code that only reads a lifecycle does not change. Code that makes its own `Lifecycle` object adds `scope`.
- `RunOptions` has the new option `scope`, the process scope. The option is optional.
- The context of a `RequestHandler`, and thus of a `FaceHandler` of `@procedures/peer`, is a `MountContext`. In 0.11.0, a `MountContext` extends `Scope`. A handler that only reads `signal` or `life` does not change. Code that calls a handler with its own context gives a scope.
- A `PhaseContext` is a `Scope`. Its `deadline`, `signal` and `clock` stay. Code that makes its own phase context gives a scope.
- A `RequestFn` gets a second argument, the scope of the request. A function with one parameter does not change.

The change log of `@mark1russell7/service` 0.11.0 gives each other change of service.

Each version in the range `^0.11.0` exports `IDENTITY_TYPES`, the list of the identity types of service. The new check below reads this list.

Service keeps some state for each copy of the package, keyed by an object. A lifecycle keys its drains, and an HTTP answer keys its owner. The public API of these three packages takes or gives such values. With two copies of service, a builder of one copy does not find the drains of the other copy. The peer gives the app and these packages one copy.

The packages that pass only plain shapes (a clock, a backoff) keep service as a plain dependency. A new check (`scripts/check-identity-peers.ts`) examines each package. It fails when a package passes an identity value of service and service is not its peer.

Notes for the step:

- npm 7 and later and pnpm 8 and later install a missing peer. The step makes the version of service in the app explicit.
- An app that links service from its own workspace gets the linked copy in these packages too. No other change is necessary.
- The `npx procedure-server` and `npx mcp-dev-tools` commands work as before: npm installs the peer.
