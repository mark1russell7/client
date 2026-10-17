---
"@procedures/client": patch
---

The `onAfterRetry` hook of `createRetryMiddleware` hears of a failure when the reader stops at the error item. A `Client` with `throwOnError` (the default) stops there. Before, the hook ran after the yield of that item, so it ran only for a success. Now it runs when the call ends: after the last item, or when the reader stops. A thrown error and an abort still do not call it. PATCH: a bug fix.
