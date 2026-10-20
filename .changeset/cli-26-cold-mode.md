---
"@procedures/mark": patch
"@procedures/peer": patch
"@procedures/server": patch
---

The cold mode of `mark` runs the procedures host of the CLI server in its own process, under `run()` of `@mark1russell7/service` (CLI-26, decision D17). This change is additive: the exit codes that a caller reads stay the same.

- Each `mark` command that runs a procedure is a service of one request, with the profile `ephemeral`. The runner owns the signals, the stop in stages and the exit. `mark` has no signal handler and no `process.exit` of its own in this path.
- The cold mode: the host has the same registry and policy as `mark --server` (`markHostOptions()`), and no listener, port, token or lockfile. The client sends each call through the new local face of the host.
- `localFace()` of `@procedures/peer` is new. It gives a face factory and a transport of `@procedures/client`. A `Client` on the transport sends its calls to the host of the same process, through the request tracking of the service, with `LOCAL_CREDENTIALS`.
- A first Ctrl-C starts the stop, and the drain aborts the call at once. Before, `mark` had its own `SIGINT` handler.
- The warm mode: the call to the CLI server gets the abort signal. A Ctrl-C now aborts the call on the server too. Before, the signal ended `mark`, and the server continued the call.
- After the command, the runner ends the process with the exit code of the command. A timer or a socket that a procedure left open does not keep the process alive.
- `run()` and `main()` of `@procedures/mark` get the optional options `run` (the options of `run()`: the process port and the clock) and `ownsProcess`. The bin gives `ownsProcess: true`. Without it, a program keeps its process: no signal handler, and the exit code goes to `process.exitCode`, as before.
- `CliContext` gets the optional field `registry`. `executeArgs()` does not use `ctx.client` for a command any more.
- A program that calls `run()` or `executeArgs()` without a port, and the REPL (`mark -i`), get no signal handler for a command. Before, the cold mode added a `SIGINT` handler for each command.

The exit codes:

- A command that succeeds: 0. A command that fails: 1. No change.
- The cold mode, a first Ctrl-C: 1, as before. This exit code is deprecated. A later MINOR of the client group changes it to 130, as the profile `ephemeral` gives.
- The warm mode, a first Ctrl-C: 130. `SIGTERM`: 143. Before, the signal ended the process, and the shell showed the same codes.
- A second signal during the stop ends the process at once with 1. Before, a second Ctrl-C in the cold mode gave 130.

Migration: none. The site, MiniMongo, Graph and jarvis start no `mark` command. A script that runs `mark` reads the same exit codes.
