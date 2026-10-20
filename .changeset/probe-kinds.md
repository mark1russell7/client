---
"@procedures/peer": patch
"@procedures/server": patch
---

The probes use the option `kinds` of `@mark1russell7/service` 0.5.8 (SYS-30).

- Each listener of `createProcedureHost()` asks `probeHandler()` for the kinds `startup`, `readiness` and `liveness`. The host has no filter of its own for `/_probes/report`. The answers do not change: the report path goes on to the next handler, as before.
- The probe port of `runProcedureHost()` takes the new option `probes.kinds`. The default is all four kinds, as in 0.17.3. Leave out `report` on a port that is not private.
- The packages of the group use `@mark1russell7/service` `^0.5.8`, so a host has one copy of the service.
