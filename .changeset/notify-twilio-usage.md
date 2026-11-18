---
"@procedures/notify": patch
---

The entry `@procedures/notify/twilio` reads the usage records of the account.

- `twilioUsageRecordsRequest` reads one page of the usage records. Its filters are `category`, `startDate` and `endDate` (days of GMT, `YYYY-MM-DD`, both included) and `pageSize` (1 to 1000).
- `extractTwilioUsageRecords` reads a page into records with `category`, `startDate`, `endDate`, `price`, `priceText`, `priceUnit`, `usage`, `count` and `asOf`, or a `TwilioFailure`.
- `twilioNextPageRequest` also reads the next page of the usage records.

A spend cap can use the records: the category `totalprice` is the price of all the usage of the days. Twilio adds the usage to the records after a delay.

This is a PATCH: new exports before 1.0.0, and no change to the other exports.
