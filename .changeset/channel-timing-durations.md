---
"@procedures/client": minor
---

`debounceChannel()` and `throttleChannel()` take a `Duration`, as every other time of the client does since 0.3.0. A plain number of milliseconds throws a `TypeError`. A new option `clock` gives the clock of their timers, for example a fake clock in a test. MINOR: a breaking change of a signature (the API is before 1.0.0).

Migration: `debounceChannel(bus, "in", "out", 300)` becomes `debounceChannel(bus, "in", "out", ms(300))`.
