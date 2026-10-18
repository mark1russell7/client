---
"@procedures/server": minor
"@procedures/mark": minor
"@procedures/peer": minor
---

`runProcedureHost()` of `@procedures/server` is the one runner entry on `run()` of `@mark1russell7/service`, for `procedure-server`, `mark serve` and `mark --server` (server stack CLI-8, decisions D6, D7 and D17). This change is a break of the server stack, thus it is its own MINOR (decision D13).

- New `runProcedureHost({ name, host, mode, profile, lockfile, log, run })`. It declares the parts of `createProcedureHost()` in one service, and starts `run()`. It gives `{ host, service, life }` when the startup ends.
- The mode `foreground` has the profile `localDev`: a second Ctrl-C exits at once. The mode `background` has the profile `daemon`: a repeat signal has no effect. Each run declares `onRepeatSignal`. `HOST_PROFILES` gives the profiles as data.
- The caps of the stages sum to 10 s. They replace the hard-exit timer of 10 s of the entries.
- The lockfile is a dependency of the service: its connect writes it before the listeners start, and its close removes it after the listeners close. New `lockfileHandle(data)` of `@procedures/peer/lockfile`.
- `runServer()` (the bin `procedure-server` and `mark serve`) and `startServerMode()` (`mark --server`) install no signal handler and no hard-exit timer. Their promise ends with the lifecycle.
- `mark --server` is the background host (decision D17). `procedure-server` and `mark serve` run in the foreground.
- The entries map their transports to a host with `peerHostOptions()` of `@procedures/peer` (CLI-7).
- `ServerRunOptions.run` and the second argument of `startServerMode()` take the options of `run()`, for a test: a process port and a clock.
- A random token of `procedure-server` has 32 bytes, as the token of `mark --server`.
- The one-shot commands of `mark` keep their interrupt. CLI-26 moves them under `run()`.

The behavior that changes:

- A second Ctrl-C of `mark --server` has no effect: the host ends its drain, in 10 s at most. A second Ctrl-C of `procedure-server` and `mark serve` exits at once with the code 1, as before.
- The process exits with the code of the lifecycle: 0 after a clean shutdown, and 1 after an error or a startup that failed.
- A random token of `procedure-server` has 64 hexadecimal characters, not 48.

Migration steps:

- The site, MiniMongo, Graph and jarvis: no change is necessary. They do not start these entries.
- A script that starts `procedure-server` or `mark serve` and stops it with a signal: no change is necessary. Wait for the exit, in 10 s at most.
- A program that embeds the server outside a service: use `startServer()`, which starts it as a peer, and `peer.stop()`.
