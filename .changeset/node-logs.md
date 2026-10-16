---
"@procedures/node": minor
---

`node.logs` (roadmap R44) gives the output of a process that `node.spawn` started: the last 64 KiB of stdout and stderr that the process registry of `client-shell` keeps. With `lines`, it gives only the last lines. With `stripAnsi`, it removes the colors. It works also after the process ended, and it only reads (`reads: ["jobs"]`).
