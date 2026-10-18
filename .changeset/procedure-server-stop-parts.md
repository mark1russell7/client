---
"@procedures/client": minor
---

`ProcedureServer` has stop parts in the shape of the runner of `@mark1russell7/service`, and its storages are dependency handles (server stack CLI-5, decision D2). This change is a break of the server stack, thus it is its own MINOR (decision D13).

- New methods of `ProcedureServer`: `stopIntake()`, `drain(deadline, signal)`, `inFlight()` and `close()`. The server is a `TransportImpl` of the runner by its shape, and the types are structural: the root and `./browser` import no code of the runner.
- `stopIntake()` refuses each new call with a retryable `UNAVAILABLE`, and ends each subscription of `events.subscribe`. The calls in flight continue.
- `drain(deadline, signal)` waits until no call is in flight, or until the deadline on the clock of the server. When the signal aborts, each call that still runs gets the abort. The drain uses only the clock of the server, with no timer of its own.
- `close()` aborts each call that still runs and stops the transports of the server. The intake stays stopped until the next `start()`, and a second close gives the same promise. `close()` does not close the storages.
- New `storageHandles()`: one `StorageHandle` for each storage, also for a storage of two collections. A handle is a `DependencyHandle` of the runner by its shape: `connect` does nothing, and `close` closes the storage and removes its collections. The runner closes the handles after the transports close.
- `start()` opens the intake again after `close()`, and the next calls get a new signal.
- `stop({ grace })` is the parts in the sequence of the stages: `stopIntake()`, `drain()` for the grace, `close()`, and then `closeStorages()`. The server can start again, as before.
- New exported types: `StopParts` and `StorageHandle`, from the root, `./browser` and `./server`.
- `callsInFlight` is deprecated. Use `inFlight()`, which gives the same count.

The behavior that changes:

- The grace of `stop({ grace })` waits on the option `clock` of the server. Before, it waited on `setTimeout`. A test that gives a fake clock and stops with a grace must advance the clock.
- During `stop()`, the intake stays stopped until the storages close. Before, a call that came while the transports stopped could start, and then find a closed storage.

Migration steps:

- The site, MiniMongo and the MCP host of Graph: no change is necessary. `stop({ grace })` keeps its result. Change `server.callsInFlight` to `server.inFlight()`.
- jarvis and Graph under `run()`: declare the parts in the service of the process. Do not call `stop()`. Declare `svc.server("procedures", {}, server)`, and declare each handle of `server.storageHandles()` with `svc.dependency(handle.name, spec, handle)`. Give the server and `run()` the same clock, with the option `clock` of each.
- A test with a fake clock that calls `stop({ grace })` with calls in flight: advance the clock by the grace, or stop without a grace.
