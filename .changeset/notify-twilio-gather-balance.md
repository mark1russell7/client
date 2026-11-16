---
"@procedures/notify": patch
---

The entry `@procedures/notify/twilio` has three new functions and a new option.

- `twilioGatherTwiml` gives the TwiML of a call that says a text in a `<Gather>`. Twilio sends the key of the person to the address `action`. With no key, the TwiML says the text `after`, and the call ends. It escapes the texts and the address.
- `twilioBalanceRequest` and `extractTwilioBalance` read the balance of the account, as a number and as the decimal text of Twilio.
- `twilioSayTwiml` and `twilioGatherTwiml` take a `voice` and a `language` for each `<Say>`. Without them, the TwiML does not change.

PATCH: new exports and a new optional parameter, before 1.0.0.
