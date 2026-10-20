---
"@procedures/mark": minor
"@procedures/peer": patch
"@procedures/server": patch
---

Breaking: each `mark` command starts under `run()` of `@mark1russell7/service` (CLI-26, decision D17). The cold mode runs the procedures host of the CLI server in its own process. The runner owns the signals, the stop in stages and the exit. Thus the exit codes of a signal change. The release before this one marked the old behaviors as deprecated.

The new behavior:

- Each `mark` command that runs a procedure is a service of one request, with the profile `ephemeral`. `mark` has no signal handler and no `process.exit` of its own in this path. `interruptSignal()` is gone.
- The cold mode (no CLI server in this folder, or `--local`): the host has the same registry and policy as `mark --server` (`markHostOptions()`), and no listener, port, token or lockfile. The client sends each call through the local face of the host.
- `localFace()` of `@procedures/peer` is new. It gives a face factory and a transport of `@procedures/client`. A `Client` on the transport sends its calls to the host of the same process, through the request tracking of the service, with `LOCAL_CREDENTIALS`.
- A first Ctrl-C starts the stop, and the drain aborts the call at once.
- The warm mode: the call to the CLI server gets the abort signal. A Ctrl-C aborts the call on the server too. Before, the signal ended `mark`, and the server continued the call.
- After the command, the runner ends the process with the exit code of the command. A timer or a socket that a procedure left open does not keep the process alive.
- `run()` and `main()` of `@procedures/mark` get the optional options `run` (the options of `run()`: the process port and the clock) and `ownsProcess`. The bin gives `ownsProcess: true`. Without it, a program keeps its process: no signal handler, and the exit code goes to `process.exitCode`.
- `CliContext` gets the optional field `registry`. `executeArgs()` does not use `ctx.client` for a command any more.
- A program that calls `run()` or `executeArgs()` without a port, and the REPL (`mark -i`), get no signal handler for a command.

The exit codes, in the cold mode and in the warm mode:

| Event | Before | From this release |
|---|---|---|
| The command ends without a failure | 0 | 0 |
| The command fails | 1 | 1 |
| The first Ctrl-C, cold mode | 1 | 130 |
| The first Ctrl-C, warm mode | the signal ended the process (the shell showed 130) | 130 |
| `SIGTERM` | the signal ended the process (the shell showed 143) | 143 |
| A second signal during the stop, cold mode | 130 | 1 |

A cold `mark server create` keeps its peer only until the end of the command. Before, the peer kept the process alive after the command.

Migration:

- A script that reads the exit code of an interrupted `mark` command: read 130 for a Ctrl-C, also in the cold mode. Read 1 for a second signal.
- A script that starts `mark server create` as a server in the foreground: start `mark --server` or `procedure-server` in its place.
- A program that calls `run()`, `main()` or `executeArgs()` of `@procedures/mark`: no change. It keeps its process. Give `ownsProcess: true` to give the process to the runner, as the bin does.
- The site: no change. It does not start `mark`.
- MiniMongo: no change. Its dev host starts through `runProcedureHost()`, not through `mark`.
- Graph: no change. It does not start `mark`.
- jarvis: no change, unless a script of jarvis reads the exit code of an interrupted `mark` command. Then apply the first step.
