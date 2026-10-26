---
"@procedures/client": minor
---

The publisher of the remote events filters the change events of a collection row by row, with the rule of its rows (roadmap CLI-78). Thus a principal with a rule of the rows can subscribe to a topic of a collection. It gets only the ids of the rows that it can read.

MINOR (breaking, pre-1.0): this change has a new default. Before, each subscriber got each id of an event, and `withheld` named the rows that the rule refused. With this change, a row that the rule refuses is not in the event of that subscriber. Before 1.0.0, a changed default raises the MINOR.

- The rule is `admission.admit` of `createCollectionProcedures()`. The reads apply the same rule. The publisher finds it in the registry of the call, so it also filters the events of other publishers on the topic.
- A changed row that the rule admits stays in `changed`. A changed row that the rule refuses, and a deleted row, go to `deleted` only when the rule admitted the row before the change. The subscriber does not get the id of a row that it could not read.
- The rule examines the rows of the event: the row after the change, from the change log, and the row before the change. While a subscriber has a filter, each write of the procedures reads the rows before it with one `getBatch()`. The publisher does not read a storage.
- When the event has no image of a row, or the rule fails, the subscriber gets a hint without ids and without `since`. It then reads the changes through the rule of the reads.
- An event with `reset: true` and an event without ids pass, without ids.
- When the subscriber can read no row of an event, it gets no event. Its next event gets the `since` of the last event that it got, so it applies the next delta without a read. The `seq` of the events counts only the events that the subscriber gets, so the subscriber sees no gap.
- With values, an event has only the values of the rows that the rule admits. `withheld` names only the rows that the output filter of the host (`admitItem`) refused.
- The new optional `admission.admitsAll(invocation, partition)` tells that a subscriber reads each row of its partition. The events of that subscriber then pass as before, with no filter and no read before a write.
- At a re-check after a change of the rights (`rightsChanged()`, roadmap CLI-44), each subscriber with a filter gets a `reset` hint, so it reads its rows again. A subscriber whose `admitsAll` changes at a re-check also gets a `reset` hint.
- A delta of `changes` gives only ids that the caller can read. Before, it put the id of each refused row in `deleted`. A delta with a refused row or a deleted row becomes a full answer (`full: true`) of the admitted rows. The copy of the caller then drops each other row. When `admitsAll` admits the caller, the delta stays as before.
- `admittedStorage()` has a new optional parameter `partition`. `admitsAll` gets it.
- New exports: `withHintImages(event, images)`, `hintImagesOf(event)` and the types `HintImages` and `HintRowState`. A publisher of change events, for example a watcher of a change stream, gives the rows before and after the change. Without them, a subscriber with a filter gets a hint without ids.

Migration:

- A subscriber that read `withheld` to find the rows that the rule refused: these rows are not in the event. A row that the subscriber read before the change and that the rule refuses after it comes as a delete.
- A reader of `changes` with a rule of the rows: apply a full answer as a replacement of the copy. The sync of `@procedures/client-store` does this. A full answer comes after each delete, so give `admitsAll` to the principals with full rights.
- A host whose `allow` of `events.subscribe` refused a principal with a rule of the rows can admit it.
- A host with full rights for some principals: give `admission.admitsAll`. Without it, the publisher examines each row of each event for each subscriber. Also, each write reads its rows before the change while such a subscriber is open.
- Graph: give `admitsAll` for the principals that read a whole partition. Then admit the principals with a `when` condition in `allow`.
- The site, MiniMongo and jarvis: no change, if their collections have no `admission.admit`. Then their events do not change.
