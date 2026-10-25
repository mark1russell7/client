---
"@procedures/peer": patch
"@procedures/ics": patch
"@procedures/collections": patch
"@procedures/shell": patch
"@procedures/client": patch
---

Fixes for the correctness findings of the second audit pass (roadmap O56).

PATCH: bug fixes. A caller that used the documented behavior sees no change.

- `server.call` of `@procedures/peer` with `address` closes the connection that it makes for the call: after a success, an error and an abort. Before, each call left its client, its entry in the map of the connections and, with WebSocket, an open socket.
- `parseIcs()` of `@procedures/ics` ignores the properties of a component inside an event. Before, the UID and the SUMMARY of a VALARM (Apple and iCloud give each alarm a UID) replaced those of the event.
- EXDATE and RECURRENCE-ID of an event with a TZID now name an occurrence by its date in that zone. Before, the occurrences were compared by their date in UTC, so an evening event in a zone west of UTC kept its excluded occurrence and showed its override next to the original. `exdates` and `recurrenceId` hold dates in the zone of `tzid`: a value in UTC or in another zone changes to it.
- `select()` of `@procedures/collections` withdraws the receives of the cases that lose, and `merge()` keeps no receive on an input while it waits for its reader. Before, each case that lost took the next value of its channel and dropped it, and `merge()` dropped about half of the values. `select()` now also gives a value that is `undefined` (a `Channel<void>`). New: `AsyncQueue.waitTake()`, `Channel.waitReceive()` and the optional `wait` of a `SelectCase`. `merge()` takes the inputs in turn.
- `shell.run` of `@procedures/shell` refuses an encoding that `Buffer` does not know at the validation of its input. `runCommand()` gives a failure result and `streamCommand()` throws, before they start the program. Before, the decode threw in the listener of the child, which ended the host, and the call never settled. Each encoding that worked before still works.
- `getTree()` of `ProcedureRegistry` in `@procedures/client` no longer writes into the stored procedures. When a path is a procedure and also the namespace of longer paths, its node is a namespace, and the procedure is at the key `""` of that node. Before, a longer path wrote its segment into the stored procedure of the shorter path (a segment such as `handler` replaced its handler), or replaced the namespace.

Notice of the next MINOR: it makes the ReDoS guard of `$regex` in the collection queries of `@procedures/client` stricter. The guard will refuse a pattern with a variable or overlapping repeated group, for example `(a|a)*` or `(\w+\s){2}`. Write such a pattern without the repeated group, for example `\w+\s\w+\s`. Only a host that turns `$regex` on sees the change.
