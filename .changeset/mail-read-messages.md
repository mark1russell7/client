---
"@procedures/mail": patch
---

`readMessages` reads the whole messages of an IMAP mailbox since a date, the newest first, at most `limit`.

- It opens the mailbox read only (EXAMINE) and fetches with BODY.PEEK, so a message stays unread.
- It reads the sizes first. It fetches only the messages up to `maxBytes`. A larger message comes with its headers and its `size`, and no `source`.
- `afterUid` gives only the messages after the cursor of the last read. `uidValidity` tells when the UIDs of the mailbox changed, so that a cursor is not valid.
- `readHeaders` and `readMessages` use one session helper: one time limit, one abort and one close on an error.

This is a PATCH: a new export before 1.0.0, and no change to the other exports.
