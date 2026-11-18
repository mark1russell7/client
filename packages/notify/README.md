# @procedures/notify

[![npm](https://img.shields.io/npm/v/@procedures/notify?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/notify)

Push notifications through ntfy (the public server or your own) and through Pushover. Text messages and voice calls through Twilio.

- With ntfy, each phone that subscribes to the topic gets the message.
- With Pushover, each device of the user gets the message. An emergency message repeats until the user acknowledges it.
- With Twilio, a phone gets a text message or a voice call. A call can tell a person from an answering machine.
- With a webhook, a server of your choice gets a signed JSON request in the form of Standard Webhooks.

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
- The option `receiptStates` gives the replies of each receipt, one at each read. After the end, each read gives the last entry again.
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
- `twilioMessageListRequest` reads one page of the texts, with the filters `to`, `from`, `dateSentAfter` and `pageSize`. `twilioNextPageRequest` reads the next page.
- `twilioOptOutKeyword` gives the keyword of a received text: `stop`, `start` or `help`.
- `twilioUsageRecordsRequest` reads one page of the usage records, with the filters `category`, `startDate`, `endDate` and `pageSize`.
- `extractTwilioText`, `extractTwilioCall`, `extractTwilioBalance`, `extractTwilioMessages` and `extractTwilioUsageRecords` read a response. `callTwilio` sends one request through the fetch that the caller gives.

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

### The replies of the recipients

A recipient can reply `STOP` to stop the texts of a Twilio number, and `START` to start them again. Twilio blocks the texts to a person who replied `STOP`. To keep a list of the recipients that agree to get texts, read the received texts and their keywords:

```ts
import { callTwilio, extractTwilioMessages, twilioMessageListRequest, twilioNextPageRequest, twilioOptOutKeyword, type TwilioRequest } from "@procedures/notify/twilio";

let request: TwilioRequest | undefined = twilioMessageListRequest(credentials, { to: twilioNumber, dateSentAfter: lastRead, pageSize: 100 });
while (request !== undefined) {
  const page = await callTwilio(fetch, request, extractTwilioMessages, { timeoutMs: 20_000 });
  if (!page.ok) break; // a TwilioFailure
  for (const text of page.messages) {
    if (text.direction === "inbound") record(text.from, twilioOptOutKeyword(text.body), text.dateSent);
  }
  request = page.nextPageUri === undefined ? undefined : twilioNextPageRequest(credentials, page.nextPageUri);
}
```

- Twilio gives the texts of a page by `dateSent`, the newest first.
- `dateSentAfter` is the filter `DateSent>`. It includes the time or the day that it names.
- `TWILIO_OPT_OUT_KEYWORDS`, `TWILIO_OPT_IN_KEYWORDS` and `TWILIO_HELP_KEYWORDS` are the default keywords of Twilio.
- A keyword is the full body of a text. The case of the letters and the white space around the keyword have no effect. `stop please` is not a keyword.
- A toll-free number of the US accepts only `START` and `UNSTOP` to start the texts again.
- An Advanced Opt-Out of a messaging service can add keywords. `twilioOptOutKeyword` knows only the default keywords.

### Failures of Twilio

- The kinds and the waits are the same as the kinds of Pushover. `code` holds the error code of Twilio.
- `rate-limited` tells that the account has too many requests at the same time. Wait `retryAfterMs`, then send the same request again.
- After `refused`, do not send the same request again. For example, the code `21211` tells that the number is not valid.

## Twilio Serverless

`@procedures/notify/twilio-serverless` has pure functions for the Twilio Serverless API. They put functions and assets on a domain of Twilio. Examples are the TwiML of a call and the address that gets the key of a person. A browser can also use them. The entry has no procedures.

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

## Webhooks

`@procedures/notify/webhook` has pure functions for webhooks in the form of [Standard Webhooks](https://www.standardwebhooks.com). A browser can also use them. The entry has no procedures.

- A sender signs the text `id.timestamp.body` with HMAC-SHA256. The headers are `webhook-id`, `webhook-timestamp` and `webhook-signature`.
- A secret is `whsec_` and the base64 of 24 to 64 random bytes. A request can have one signature for each secret, thus a receiver can change its secret.
- A receiver checks the signature and the time, in a tolerance of 5 minutes.

```ts
import { parseWebhookSecret, sendWebhook, verifyWebhook, webhookBody } from "@procedures/notify/webhook";

const parsed = parseWebhookSecret(process.env.WEBHOOK_SECRET ?? "");
if (!parsed.ok) throw new Error(parsed.problem);
const body = webhookBody("alert.sent", Date.now(), { title: "Tornado warning" });
const sent = await sendWebhook(fetch, { url, id: crypto.randomUUID(), timestampMs: Date.now(), body }, [parsed.secret]);

// The receiver reads the body as text, before a parse.
const check = await verifyWebhook({ headers: request.headers, body: text }, [parsed.secret], Date.now());
```

### Failures of a webhook

`extractWebhookSent` sorts a response by the rules of the spec. The extractor does not throw.

- `throttled` (429, 502, 504) and `server` (other 5xx) get a wait from `Retry-After`, and 5 seconds at least.
- `gone` (410) tells the sender to stop each send to the endpoint.
- `redirect` (3xx) is a failure. Change the address. The send does not follow a redirect.
- `refused` (other statuses) fails again with the same message.
- `network` and `timeout` have no answer. The time limit is 15 seconds.

Each send of one message keeps its id, thus the receiver drops a second copy. A secret is a key: do not log it.
