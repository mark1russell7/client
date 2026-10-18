---
"@procedures/ics": patch
---

When the request of `fetchCalendar` (and `ics.fetch`) fails, the error includes the system error code, for example "the request failed (ECONNREFUSED)". The code comes from the field `cause` of the error of `fetch`. The error never includes the message of the cause, because that message can include the secret address of the feed.
