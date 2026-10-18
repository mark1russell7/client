---
"@procedures/peer": patch
---

`createProcedureHost()` has the new option `controller` (server stack CLI-45). `controller.requires` names the dependencies of the service that each call of the host needs. `host.controllers` gives them, and `host.declare(svc)` declares them on the controller of the host. While a check of one of them fails readiness, the service refuses each call with `UNAVAILABLE`, which a caller can send again. Without the option, the controller needs no dependency, as before.

jarvis needs this option: its procedure calls need its world store.
