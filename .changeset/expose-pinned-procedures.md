---
"@procedures/client": minor
"@procedures/peer": minor
---

The expose rule of a server applies to each procedure that it serves, also to each procedure that it pins (server stack CLI-47). Only an explicit `alwaysOn` pin is outside the rule. This change is a break of the server stack, thus it is its own MINOR (decision D13).

Before, `ProcedureServer` examined the expose rule only for a procedure of its registry. A procedure that `registerProcedure()` or `registerProcedures()` pinned was outside the rule. The collection procedures of `registerCollectionProcedures()` and of the option `collections` of `createProcedureHost()` are pins, so the rule did not hide them. For example, `hostPolicy({ exclude: ["collections.examples.clear"] })` had no effect on a call of `collections.examples.clear`.

- New option `alwaysOn` of `ProcedureServer.registerProcedure(procedure, options)`, `registerProcedures(procedures, options)` and `registerModule(module, options)`, with the new type `RegisterProcedureOptions`. True: the server serves the pin, also when its expose rule does not match the path. The default is false.
- Only the procedures of the host set it. `createProcedureHost()` pins `host.health`, `host.info` and `host.metrics` with `{ alwaysOn: true }`. The server pins `events.subscribe` with `{ alwaysOn: true }`, because the topic rule is its expose rule.
- Each other pin passes the same expose rule as a procedure of the registry: the lookup of each call (HTTP, WebSocket and MCP), `hasProcedure()`, `procedureOf()` and `procedureCount`. The manifests, the discovery and the MCP tool list already used the rule. The rule of the nested calls is the same as before.
- `createProcedureHost()`: the option `expose` wins over the rule of the policy, for the server and now also for each face. `host.policy` has this rule. Before, the MCP face listed the tools of the rule of the policy.

The behavior that changes:

- A server with an expose rule does not serve a pin that its rule does not match. A call gets `NOT_FOUND`, as for a procedure of the registry that the rule hides.
- A host with an expose rule serves only the collection procedures that its rule lists. An `exclude` of the policy hides one of them.
- `host.health`, `host.info`, `host.metrics` and `events.subscribe` stay on, whatever the expose rule says.
- A server or a host without an expose rule changes nothing.

Migration steps:

- A host with an `expose` rule must list the collection procedures that it serves, for example `collections.notes.*`. `host.*` and `events.subscribe` stay always on.
- An app that pins its own procedures with `registerProcedures()` on a server with an expose rule: list them in the rule. Give `{ alwaysOn: true }` only to a procedure of the host itself.
- The site: no change is necessary. Its servers have no expose rule.
- MiniMongo: no change is necessary. Its server has an expose rule, but it pins no procedure and serves no collection.
- The `mark` CLI and `procedure-server`: no change is necessary. They serve no collection, and `--expose` keeps `host.*` and `events.subscribe` on.
- jarvis: no change is necessary. Its host has no expose rule.
- The procedures host of Graph (GRAPH-11): no change is necessary. Its rule `["collections.*", "graph.*"]` lists the collection procedures. To hide `clear`, an `exclude` of the policy now has an effect.
