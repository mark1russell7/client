---
"@procedures/notify": patch
---

The entry `@procedures/notify/twilio` reads the list of texts and the keywords of the replies.

- `twilioMessageListRequest` reads one page of the texts of the account. Its filters are `to`, `from`, `dateSentAfter` (the filter `DateSent>`) and `pageSize` (1 to 1000).
- `twilioNextPageRequest` reads the next page from `nextPageUri`. It refuses a path that is not in the Twilio API.
- `extractTwilioMessages` reads a page into texts with `sid`, `from`, `to`, `body`, `direction`, `status`, `dateSent` and `errorCode`, or a `TwilioFailure`.
- `twilioOptOutKeyword` gives `stop`, `start` or `help` for a text that is only a default keyword of Twilio. It ignores the case of the letters and the white space around the keyword.
- `TWILIO_OPT_OUT_KEYWORDS`, `TWILIO_OPT_IN_KEYWORDS` and `TWILIO_HELP_KEYWORDS` are the default keywords. `TWILIO_LIMITS.pageSize` is 1000.

This is a PATCH: new exports before 1.0.0, and no change to the other exports.
