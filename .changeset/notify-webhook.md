---
"@procedures/notify": patch
---

The new entry `@procedures/notify/webhook` sends and checks webhooks in the form of Standard Webhooks (https://www.standardwebhooks.com).

- `webhookRequest` signs a JSON body with one secret or more. `sendWebhook` sends it once through a fetch that the caller gives.
- `extractWebhookSent` sorts a response by the rules of the spec: `redirect`, `gone`, `throttled`, `server` and `refused`, with a wait from `Retry-After`.
- `verifyWebhook` checks the headers, the time in a tolerance of 5 minutes, and the signature, with the comparison of WebCrypto.
- `parseWebhookSecret` and `webhookSecretText` read and write the secrets `whsec_` of 24 to 64 bytes.

The entry imports no Node built-in, thus a browser can also use it. This is a PATCH: a new entry, and no change to the other entries.
