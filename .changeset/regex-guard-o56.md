---
"@procedures/client": minor
---

The guard of `$regex` refuses more patterns that can take an exponential time (roadmap O56, audit finding 11).

MINOR: a possible break. A host that turned `$regex` on with a `queryPolicy` can now get `VALIDATION_ERROR` for a pattern that passed before. The default policy does not permit `$regex`, so a host without a `queryPolicy` sees no change.

Before, the guard refused only a repeated group with an unbounded repetition inside, for example `(a+)+`. V8 still took an exponential time for `(a|a)*$`, `(a|aa)+$`, `(a{2,3})+` and `(a{1,50}){1,50}`. Now a group that repeats more than one time is refused when it can match the same text in more than one way:

- It holds a repetition without a bound, for example `(a+)+`, and now also `(a+){9}` and `(\w+\s){2}`. The reason stays "repeats a group that repeats without a bound".
- It holds a repetition of variable length, for example `(a{2,3})+` or `(a?a?)+`. The reason is "repeats a group with a repetition of variable length".
- It holds alternatives that can start with the same character, for example `(a|aa)+` or `(\d|\w)+`. With the flag `i`, `a` and `A` are the same character. The reason is "repeats a group with alternatives that can start with the same character".

A bounded repetition with at most 1000 ways to match passes, for example `(\d{1,3}\.){3}`. Alternatives that start with different characters pass, for example `(?:foo|bar)+` and `(?:[a-z]|-)+`.

Migration: the site, MiniMongo, Graph and jarvis do not turn `$regex` on, so they need no change. A host that turns it on and gets the new `VALIDATION_ERROR` writes the pattern without the ambiguity. For example, write `(?:a|b)+` for `(a|ab|b)+`, or repeat a group a fixed number of times.
