---
"@procedures/client": patch
---

The guard of `$regex` counts the ways of a nested repetition with a fixed count (weekly audit 2026-10-25).

PATCH: a fix of the guard of 0.28.0 (decision D33b). That guard permits a bounded repetition only when it has at most 1000 ways to match. It counted a repetition with a fixed count, for example `{9}`, as one way. Thus `((a|a){9}){9}` passed with 2^9 ways, but it has 2^81 ways, and V8 takes hours on a string of 80 `a` characters.

Now each repetition multiplies the ways of the part inside it. The guard refuses `((a|a){9}){9}` and `((a?){9}){9}`. A pattern with few ways still passes, for example `((?:a|b){3}){3}` and `(\d{1,3}\.){3}\d{1,3}`.

Migration: the site, MiniMongo, Graph and jarvis do not turn `$regex` on, so they need no change.
