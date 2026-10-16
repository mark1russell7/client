# @procedures/systems

[![npm](https://img.shields.io/npm/v/@procedures/systems?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/systems)

```sh
npm install @procedures/systems
```

The timer law of [systems](https://mark1russell7.github.io/systems/) for the client. The package binds the times of the middleware, the transports and the server to the symbols of the law. Then it examines the rules of the client.

A timer that is too short or too long for another timer opens a window of failure. Example: when one try can take longer than the request time of the WebSocket transport, the transport ends the try first. Then the retry sees a transport error, not a timeout of the try. The law finds such an order before the application starts.

## The rules

| Rule | The rule |
|---|---|
| `try-under-transport-timeout` | The time of one try is less than the request time of the WebSocket transport. |
| `overall-covers-retries` | The overall time of a call covers each try and each backoff of the retry. |
| `keyed-result-outlives-call` | The server keeps the result of a keyed write longer than the longest call with its retries. |
| `dead-connection-before-request-timeout` | The client finds a dead connection before a call on it reaches the request time of the transport. |
| `server-finds-dead-client` | The server finds a dead client before a call of the server to it reaches its request time. |
| `breaker-outlasts-backoff` | The circuit breaker stays open longer than the longest backoff of the retry. |

`CLIENT_RULES` holds them as data, in the format of `@mark1russell7/service`. The evaluator of that package gives the verdicts:

- `holds`: each inequality holds.
- `violated`: an inequality does not hold. The `window` of the rule tells what goes wrong.
- `unbounded`: the rule holds only because a timer has no limit.
- `depends`: a timer of the rule is off, so the rule has no value to examine.

The defaults of the core (`TIMER_DEFAULTS` of `@procedures/client`) obey each rule. A test examines them.

## Use

```typescript
import { seconds } from "@procedures/client";
import { lintTimers } from "@procedures/systems";

const findings = lintTimers({
  perAttempt: seconds(40),
  overall: seconds(60),
  retry: { maxRetries: 2 },
});
for (const finding of findings) {
  if (finding.verdict === "violated") console.log(finding.rule, finding.window);
}
```

- A setting that the application does not give takes the default of the core.
- `bindingOf(settings)` gives the values of the symbols, in seconds. It also gives the retry budget (each try and each backoff at their longest) and the longest call.
- The procedure `systems.timers` gives the same verdicts. Its input gives the times in milliseconds, as the wire does.

```sh
mark systems timers --per-attempt-ms 40000
```

## Related packages

- [`@procedures/client`](../client): the core, with the timers.
- [`@mark1russell7/service`](https://www.npmjs.com/package/@mark1russell7/service): the evaluator of the law.
