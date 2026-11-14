---
"@procedures/notify": patch
---

`@procedures/notify` sends through Pushover. The change adds names and is backward compatible, so it is a patch.

- The new procedures are `notify.pushover.send`, `notify.pushover.receipt`, `notify.pushover.cancel`, `notify.pushover.validate` and `notify.pushover.limits`.
- `notify.pushover.send` with the priority `2` sends an emergency message. Pushover repeats it until the user acknowledges it, or until it expires.
- `notify.pushover.cancel` stops the repeats by a receipt, or by a tag. With a tag, a process that did not send the message can stop it.
- The procedures read the keys from `PUSHOVER_APP_TOKEN` and `PUSHOVER_USER_KEY`. Each variable name of `tokenEnv` and `userEnv` starts with `PUSHOVER_`.
- The new entry `./pushover` has pure request builders and extractors, and `callPushover`. The caller gives the fetch. The entry imports no Node built-in.
- A builder throws an error for input that Pushover refuses. An extractor gives each failure as a value with a `kind`, and does not throw.
