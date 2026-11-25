---
"@procedures/shell": patch
---

`@procedures/shell/command` gets `execProgramSync` and `execProgram`. Each starts a program, waits for its end and gives its output, as `execFileSync` and the promise form of `execFile` of Node do, and throws (or rejects) when the program fails. They start the program with `spawnProgramSync` and `spawnProgram`: on Windows they find a program only in the folders of `PATH`, and they start no shell. `programError` gives the error of a start result, and `EXEC_MAX_BUFFER` is the default limit of each output stream (1 MiB).
