# Brief: who owns the server

This brief starts a session of its own. The owner asked for it on 2026-10-17. It gives the facts, the file paths and the three decisions to make. Nobody made these decisions yet: roadmap R37 parked them.

## The question

Three places have code that serves procedures over HTTP or runs a process: the client monorepo, the `systems` monorepo and jarvis. Each one has its own server, its own stop and health code, and its own token check. The session decides which part owns each job, and how the other parts use it.

## What is settled

jarvis runs its procedures on `@procedures/client` since 2026-10-16. `~/jarvis/packages/core/src/procedures.ts` keeps the jarvis shape of a procedure, and it maps the jarvis rules onto the capability of the client:

| jarvis | `@procedures/client` |
| --- | --- |
| The audience | The clearance, on the ladder of `SCOPES` |
| `reads`, refused when it is absent | The effects |
| The scoped world | The resources of each invocation |
| `gateRow` | The output filter of the host (`admitItem`) |

So the registry and the invocation path are shared already. The open part is everything around them.

## The three parts that overlap

| Part | Client monorepo (`~/git/client`) | `systems` (`~/git/systems`) | jarvis (`~/jarvis`) |
| --- | --- | --- | --- |
| The HTTP server of procedure calls | `ProcedureServer` (`packages/client/src/server/procedure-server.ts`), the HTTP transport and `streamToHttp` (`packages/client/src/adapters/http/server/transport.ts`), the peer with Express (`packages/client-server/src/peer/index.ts`), and the `procedure-server` command (`packages/server`) | None | Its own `node:http` server (`packages/http/src/index.ts`) with the UI, the map tiles, the chat routes, ingest, the login page and the procedure routes |
| The stop and the health of a process | `ProcedureServer.stop({ grace })` (roadmap R14), `peer.stop`, and `host.health`, `host.info` and `host.metrics` (`packages/client/src/server/host-procedures.ts`, roadmap R19) | `@mark1russell7/service`: `service()` (`builder.ts`), `run()` with the stop in stages (`lifecycle.ts`), `start()` with the health checks (`health.ts`) and the signals of the process (`process.ts`) | Uses `service()`, `start()` and `run()` (`packages/instance/src/service.ts`) |
| Authentication | `HostPolicy` (`packages/client/src/server/host-policy.ts`), the `authenticate` hook and the principal (roadmap R18), and the token of the peer (`packages/client-server/src/peer/security.ts`) | None | A token from a cookie, the header `x-jarvis-token` or `?token=`, and a guard for a loopback `Host` (`packages/http/src/index.ts`, `packages/http/src/ingest.ts`) |

## What the overlap costs today

- jarvis does not get the streaming of the client server. Its PR #34 needs a keep-alive line for long NDJSON streams. So the client exports `writeNdjsonStream` from `@procedures/client/node` for it (branch `integration-ndjson-keepalive`).
- Four functions compare a token: two in the client and two in jarvis. On 2026-10-17 a re-audit of jarvis found that the two of the client told the length of the token through their time. Each copy needs each fix.
- The client server has its own stop and health code. `service` has a tested stop in stages, and only jarvis uses it.

## The decisions

1. **A host that an app can mount.** Can the HTTP host of the client mount in the `node:http` server of another app, as a handler at a path? Then jarvis keeps its own routes, and its procedure calls get the full path of the client. That path has streaming, keep-alive, `seq`, the error codes, the capability checks and the remote events. Questions for the design:
   - How does the app give the principal and the audience of a request?
   - Which part writes the response headers?
   - How does a stop of the app stop the calls in flight?
2. **The stop and the health of the client hosts.** Do the peer, the `procedure-server` command and `mark serve` run under `run()` and `start()` of `service`? Roadmap R37 says "adopt later in the Node packages". Questions for the design:
   - Which code of `ProcedureServer.stop` and `peer.stop` stays?
   - Do `host.health` and the health checks of `start()` become one thing?
   - Which entry of `service` can the Node entries of the client import?
3. **One place for authentication.** Does the app give the principal through the `authenticate` hook of `HostPolicy`, with one shared token check? Questions for the design:
   - Where do the cookie, the header and the loopback guard of jarvis go?
   - Is the token check one export of the client, or of `service`?

## Rules that stay

- The client depends on the general packages from npm. `systems` does not import a `@procedures` package.
- The root and the browser entry of `@procedures/client` stay free of `node:` imports. The site budgets and `scripts/check-side-effects.mjs` pin this. Node code goes in the Node entries, for example `@procedures/client/node`.
- Heavy work, timing tests and harness cells run in CI only.
- The session markt-54 and the owner own npm publishing and the publish workflows. In the client, `RELEASE.md`, `scripts/publish-ci.mjs` and `.github/workflows/release.yml` stay as they are.
- The systems session reviews and merges each pull request of `systems`. The jarvis session changes jarvis.
- The prose of this repository is STE (`CLAUDE.md`), and `pnpm lint:ste` examines it.

## To read first

- `ROADMAP-2026-10.md`, section R37 (the service abstraction), and the items R14, R18, R19 and R24.
- `WIRE-PROTOCOL.md`, `EVENTS.md` and `CAPABILITIES-2026-10.md` in this folder.
- `~/git/systems/packages/service/README.md`.
- `~/jarvis/packages/core/src/procedures.ts` and `~/jarvis/packages/http/src/index.ts`.
