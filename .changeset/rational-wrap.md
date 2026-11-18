---
"@procedures/rational": patch
"@procedures/quantity": patch
---

A new wrap of kind 1, made from the types of its home, with no procedure written by hand:

- `@procedures/rational`: 24 of 24 functions of `@mark1russell7/rational`, exact fractions over `bigint`. The codecs of the generator give each `bigint` as a decimal string, so a rational is `{ "n": "3", "d": "2" }` in JSON.

The wrap is pure. `wraps.programs.json` has a new program across two libraries: the seconds of 0.1 h plus 0.2 h, with no rounding (rational and quantity). It gives 1080 exactly.

`@procedures/quantity` uses `@mark1russell7/rational` 0.1.3, the version of the new wrap, in place of 0.1.2.

PATCH: before 1.0.0, a backward-compatible feature raises PATCH. The new package adds procedures and changes no procedure of another package.
