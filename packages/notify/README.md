# @procedures/notify

[![npm](https://img.shields.io/npm/v/@procedures/notify?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/notify)

Push notifications through ntfy (the public server or your own) and through Pushover. Text messages and voice calls through Twilio.

- With ntfy, each phone that subscribes to the topic gets the message.
- With Pushover, each device of the user gets the message. An emergency message repeats until the user acknowledges it.
- With Twilio, a phone gets a text message or a voice call. A call can tell a person from an answering machine.

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

## Twilio

`@procedures/notify/twilio` has pure functions for text messages and voice calls of Twilio. A browser can also use them. The entry has no procedures.

- `twilioTextRequest` sends a text. `twilioTextStatusRequest` reads its status.
- `twilioCallRequest` starts a call. `twilioCallStatusRequest` reads its status, and `twilioEndCallRequest` ends it.
- `twilioSayTwiml` gives the TwiML of a call that says a text. It escapes the text.
- `twilioGatherTwiml` says a text in a `<Gather>` and sends the key of the person to an address. With no key, it says the text `after`.
- Each TwiML builder takes a `voice` and a `language` for each `<Say>`.
- `twilioBalanceRequest` reads the balance of the account.
- `extractTwilioText`, `extractTwilioCall` and `extractTwilioBalance` read a response. `callTwilio` sends one request through the fetch that the caller gives.

```ts
import { callTwilio, extractTwilioCall, twilioCallRequest, twilioSayTwiml } from "@procedures/notify/twilio";

const request = twilioCallRequest(credentials, {
  to: phone, // E.164: a plus sign, the country code and the number
  from: twilioNumber,
  twiml: twilioSayTwiml("A test of the alerts.", 3),
  ringMs: 45_000,
  machineDetection: "Enable",
});
const call = await callTwilio(fetch, request, extractTwilioCall, { timeoutMs: 20_000 });
```

### The credentials

`credentials` has the account SID (`AC`) and the auth token of the account. Better: give an API key with `keySid` (`SK`) and its secret. You can revoke a key and keep the account.

A request holds the credentials in its `authorization` header. Do not log a request or its headers.

### The states

- A text is `pending`, `delivered` or `failed`. A carrier confirms the delivery of a text only in some countries.
- A call is `pending`, `connected`, `answered`, `machine`, `unanswered` or `failed`. `ended` is true when the status cannot change again.
- Only a call with `machineDetection` tells `answered` (a person) from `machine`. Without it, an answered call is `connected`.

### Failures of Twilio

- The kinds and the waits are the same as the kinds of Pushover. `code` holds the error code of Twilio.
- `rate-limited` tells that the account has too many requests at the same time. Wait `retryAfterMs`, then send the same request again.
- After `refused`, do not send the same request again. For example, the code `21211` tells that the number is not valid.

## Twilio Serverless

`@procedures/notify/twilio-serverless` has pure functions for the Twilio Serverless API. They put functions and assets on a domain of Twilio, for example the TwiML of a call or the address that gets the key of a person. A browser can also use them. The entry has no procedures.

- `twilioServerlessServiceRequest` makes a service. `twilioServerlessServiceFetchRequest` reads a service by its SID or its unique name.
- `twilioServerlessFunctionRequest` and `twilioServerlessAssetRequest` make a function and an asset. The list requests read them, one page at a time.
- `twilioServerlessFunctionVersionRequest` and `twilioServerlessAssetVersionRequest` upload the text of a file as a new version. The body is multipart, and the same input gives the same body.
- `twilioServerlessBuildRequest` starts a build of versions, with the npm packages and the runtime of the functions.
- `twilioServerlessBuildStep` gives the next step of the poll of a build. It has no timer: the caller waits, sends the request and gives the read to the next step.
- `twilioServerlessEnvironmentRequest` makes an environment. Its domain name is in the read of the environment.
- `twilioServerlessVariableRequest` and `twilioServerlessVariableUpdateRequest` set a variable of an environment.
- `twilioServerlessDeploymentRequest` deploys a complete build to an environment.
- `twilioServerlessNextPageRequest` reads the next page of a list. It refuses an address of another host.
- Each `extractTwilioServerless...` function reads a response into a typed result or a `TwilioFailure`. It does not throw.

The credentials, `TwilioRequest`, `TwilioResponse`, `TwilioFailure` and `callTwilio` are the same as in `./twilio`. A builder throws an error when the input breaks a rule of the API, for example a path without a slash at the start.

```ts
import { callTwilio } from "@procedures/notify/twilio";
import {
  extractTwilioServerlessBuild,
  twilioServerlessBuildRequest,
  twilioServerlessBuildStep,
} from "@procedures/notify/twilio-serverless";

const started = await callTwilio(fetch, twilioServerlessBuildRequest(credentials, serviceSid, { functionVersions, runtime: "node22" }), extractTwilioServerlessBuild, { timeoutMs: 20_000 });
if (!started.ok) throw new Error(started.errors.join(" "));
const poll = { serviceSid, buildSid: started.sid, startedAt: Date.now() };
let step = twilioServerlessBuildStep(credentials, poll, Date.now(), started);
while (step.step === "poll") {
  const { waitMs, request } = step;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  const read = await callTwilio(fetch, request, extractTwilioServerlessBuild, { timeoutMs: 20_000 });
  step = twilioServerlessBuildStep(credentials, poll, Date.now(), read);
}
```

After `done`, `twilioServerlessDeploymentRequest` deploys the build. After `failed` or `timed-out`, `last` holds the last read.

`twilioServerlessDeploy` deploys a plan with these functions: the service, the environment, the files, the build and the variables. Its ports hold the fetch, the clock and the wait.

- A second deploy of the same plan reads three lists and changes nothing.
- A change of a variable alone deploys the build of the environment again.
- A new `version` of the plan uploads the files again. The variable `DEPLOY_VERSION` holds the version of the last deployment.
- Each step can go again. After a failure, start the deploy again.

```ts
import { twilioServerlessDeploy } from "@procedures/notify/twilio-serverless";

const result = await twilioServerlessDeploy({ fetch, now: Date.now, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }, credentials, {
  service: { uniqueName: "my-app", friendlyName: "My app" },
  environment: { uniqueName: "production", domainSuffix: "prod" },
  functions: [{ path: "/start", visibility: "public", content: code }],
  build: { runtime: "node22", dependencies: { twilio: "5.0.0" } },
  variables: { FROM: from },
  version: contentHash,
});
if (result.ok) console.log(`https://${result.domainName}/start`);
```

A variable can hold a secret. Do not log a variable request, a variable read or its value.
