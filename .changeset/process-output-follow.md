---
"@procedures/shell": minor
"@procedures/node": minor
---

The process registry of `@procedures/shell/command` gives the output of a process after a time. `processes.subscribe(id, { output, end })` calls `output` with each new piece of output and its stream, and `end` with the record at the end of the process. `processes.follow(id, { backlog, signal, maxBufferedBytes })` gives the output as an async stream: the kept output without a gap, the new pieces in UTF-8, a `dropped` item for a slow reader, and an `end` item. The end of the process removes each subscriber, and a follow that ends removes its subscriber.

`node.logs` has the option `follow` (short `-f`). With it, the result is a stream: the kept output as `output` lines (`lines` limits them), each new line of stdout and stderr, and an `exit` item at the end of the process. The stream ends at the end of the process, at an abort of the caller and when the reader stops. `node.logs` declares `stream: { unbounded: true }`.
