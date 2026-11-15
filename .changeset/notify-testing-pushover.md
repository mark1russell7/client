---
"@procedures/notify": patch
---

The new entry `@procedures/notify/testing` has a fake of the Pushover API for tests. `pushoverApi` gives the routes of a scripted server of `@mark1russell7/rigor-testkit/http`, with a reply to the request of each builder of `./pushover`. `pushoverFetchTo` sends the requests of the builders to that server. `pushoverLedgerOf` reads the records of the server: each send, its first read and its first cancel, by receipt or by tag.

`@mark1russell7/rigor-testkit` is an optional peer dependency. The other entries do not use it.

PATCH: a new feature before 1.0.0 (0.y.z).
