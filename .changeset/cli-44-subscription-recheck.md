---
"@procedures/client": patch
---

New: an open subscription can get the checks of its admission again (roadmap CLI-44). Before, `EventPublisher` examined the rights of a subscriber only at the start of `events.subscribe`. A subscription of a collection change feed thus continued after the app revoked a right.

`rightsChanged(change)` of `EventPublisher` starts a check of each open subscription that the change touches. The change is the id of a principal, a test of the principal, or no value for each subscription. The new option `recheck` of `EventPublisherOptions` has `maxAge`, a check after a time on the clock of the publisher. It also has `rightsChanges`, a source of the changes of the app.

The check is the same function as at the start: the topic rule, the reads, `allow` and the partition. While it operates, the events of the subscription wait. A refusal ends the subscription with its error, for example `FORBIDDEN`. The events that waited do not reach the subscriber. The new option `clock` of `EventPublisherOptions` is the clock of `maxAge`, and a `ProcedureServer` gives its own clock. Without a call of `rightsChanged()` and without the option `recheck`, nothing changes.
