---
"@procedures/gh": patch
---

A wait of the REST client for its limits keeps a Node process alive, as the request does.

- Before, the timer of the wait did not keep the process alive. A script with a top-level `await` of two writes stopped during the wait of the second write, with the exit code 13.
- The timers of the store and the limiters do not keep a process alive, as before.
- When the caller gives the option `clock`, the waits use its timers, as before.
