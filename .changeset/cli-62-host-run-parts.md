---
"@procedures/server": patch
---

New: the option `declare` of `runProcedureHost()` adds the parts and the dependencies of an app to the service of the process (CLI-62). Before, an app had no hook to declare its own parts. MiniMongo gave its Vite dev server to the host as a face with stop parts only, and its Mongo connection had no part.

- `declare(svc, host)` gets the builder of the service and the host before `run()`. The app uses the methods of the builder: `svc.server()`, `svc.dependency()` with its handle, `svc.check()` and `svc.onPhase()`.
- `describe()` shows each part of the app. The runner starts each part with the host, and stops it in its stage of the shutdown.
- The parts of the app come after the parts of the host. Thus the server of the host starts before a transport of the app, and a listener of the app can mount `host.handler`.
- The lockfile comes after the dependencies of the app. It connects last, and it closes first.
- A dependency of the app can gate the calls with the option `controller.requires` of the host.

PATCH: a new optional option. Without it, the service has only the parts of the host, as before.
