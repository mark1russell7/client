# @procedures/notify

[![npm](https://img.shields.io/npm/v/@procedures/notify?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/notify)

Push notifications through ntfy (the public server or your own) and through Pushover.

- With ntfy, each phone that subscribes to the topic gets the message.
- With Pushover, each device of the user gets the message. An emergency message repeats until the user acknowledges it.

## Install

```bash
pnpm add @procedures/notify @procedures/client
```

A host registers the procedures with `createRegistry(notifyModule)`, or with `import "@procedures/notify/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

| Procedure | Effects | What it does |
| --- | --- | --- |
| `notify.send` | writes `network`, not destructive | Sends a notification through ntfy with a title, a priority, tags and a tap address. |
| `notify.pushover.send` | writes `network`, not destructive | Sends a Pushover message. Priority `2` repeats until the user acknowledges it, and gives a receipt. |
| `notify.pushover.receipt` | reads `network` | Reads the receipt of an emergency message: acknowledged, the time, the device, expired. |
| `notify.pushover.cancel` | writes `network`, idempotent | Stops the repeats of an emergency message, by its receipt or by a tag. |
| `notify.pushover.validate` | reads `network` | Examines a user key and gives its devices. It sends no message. |
| `notify.pushover.limits` | reads `network` | Reads the monthly limit of messages of the application. |

## Example

```ts
await client.exec(["notify", "send"], { topic: "my-long-random-topic", title: "Backup done", message: "3 files" });
```

## Privacy

On the public server, anyone who knows a topic can read its messages. Use a long random topic name, and do not send private content. For a protected topic, `tokenEnv` names the environment variable with the access token.

The name starts with `NTFY_` or `NOTIFY_`, for example `NTFY_TOKEN`. The procedure refuses another name. The caller chooses the server, so another name lets it send a secret of the host, for example `GITHUB_TOKEN`, to its own server.

## Pushover

An emergency message has the priority `2`. Pushover repeats it each `retryMs` until the user acknowledges it, or until `expireMs` ends. The send gives a `receipt`. Then `notify.pushover.receipt` tells if the user acknowledged the message, and when.

```ts
const sent = await client.exec(["notify", "pushover", "send"], {
  message: "A test of the alerts",
  priority: 2,
  retryMs: 60_000,
  expireMs: 3_600_000,
  tags: ["test-1"],
});
await client.exec(["notify", "pushover", "cancel"], { tag: "test-1" });
```

### The keys

The procedures read the API token from `PUSHOVER_APP_TOKEN` and the user key from `PUSHOVER_USER_KEY`. The input `user` can give the user key directly.

`tokenEnv` and `userEnv` can name other variables. Each name starts with `PUSHOVER_`, for example `PUSHOVER_APP_TOKEN_2`. The procedures refuse another name.

### The entry `./pushover`

`@procedures/notify/pushover` has pure functions. A browser can also use them.

- A request builder gives the URL, the method, the headers and the body of one call. It sends no request.
- An extractor reads the status, the headers and the body text of a response into a typed result.
- `callPushover` sends one request through the fetch that the caller gives, and reads the response with an extractor.

```ts
import { callPushover, extractPushoverSent, pushoverSendRequest } from "@procedures/notify/pushover";

const request = pushoverSendRequest(token, {
  user,
  message: "A test of the alerts",
  priority: 2,
  emergency: { retryMs: 60_000, expireMs: 3_600_000, tags: ["test-1"] },
});
const sent = await callPushover(fetch, request, extractPushoverSent, { timeoutMs: 20_000 });
```

A request holds the API token. Do not log a request or its URL.

### The entry `./testing`

`@procedures/notify/testing` has a fake of the Pushover API for tests. The fake is data for `startScriptedServer` of `@mark1russell7/rigor-testkit/http`.

- `pushoverApi` gives the routes of the fake. Each request builder of `./pushover` gets a reply.
- `pushoverFetchTo` sends the requests of the builders to the fake.
- `pushoverLedgerOf` reads the records of the server: each send, its first read and its first cancel.

`@mark1russell7/rigor-testkit` is an optional peer dependency. Add it to the `devDependencies` of your tests.

```ts
import { startScriptedServer } from "@mark1russell7/rigor-testkit/http";
import { pushoverApi, pushoverFetchTo, pushoverLedgerOf } from "@procedures/notify/testing";

const server = await startScriptedServer(pushoverApi({ tags: ["test-1"] }));
const sent = await callPushover(pushoverFetchTo(server.url), request, extractPushoverSent, { timeoutMs: 5_000 });
const ledger = pushoverLedgerOf(server.requests);
await server.close();
```

### Failures and pace

- A request builder throws an error when the input breaks a rule of the API. Pushover refuses such a request, and many refusals can block the address of the caller.
- An extractor and a procedure do not throw for a failure of Pushover. They give a value with `ok: false`, a `kind` and the `errors` of Pushover.
- The kinds are `network`, `timeout`, `server`, `rate-limited`, `auth` and `refused`.
- After `network`, `timeout` or `server`, wait `retryAfterMs` (5 seconds) or more. Then send the same request again.
- After `refused` or `auth`, do not send the same request again.
- After `rate-limited`, the application sent its messages of the month. Each send fails until `resetAt`.
- Read one receipt at most once in 5 seconds.
