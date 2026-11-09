---
"@procedures/server": patch
---

`runProcedureHost()` takes the option `telemetry`: a function that starts the telemetry SDK of the app. The host starts it before the dependencies and the listeners, and gives `{ stopOnSignals: false }`. The phase `flush the output` stops it last. The cap of the phase limits the wait. The new exports are `TELEMETRY_FLUSH_PHASE`, `HostTelemetry` and `HostTelemetryOptions`.
