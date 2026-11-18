---
"@procedures/notify": patch
---

The fake of the Pushover API in `@procedures/notify/testing` has a new option `receiptStates` and a new type `PushoverReceiptReply`.

- `receiptStates(index)` gives the replies of receipt `pushoverReceiptOf(index)`, one at each read, in order. After the end, each read gives the last entry again.
- Thus a test can acknowledge one message and keep the others pending, or change the state of a receipt between two reads.
- Without the option, each read gives `state` and `acknowledgedAt`, as before. An empty list throws a `RangeError`.

PATCH: a new optional option and a new type, before 1.0.0.
