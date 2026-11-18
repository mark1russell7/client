/**
 * The entry `@procedures/notify/testing` holds the fakes of the notification services for tests.
 *
 * The fake of the Pushover API is data: `pushoverApi` gives the routes of a scripted server of
 * `@mark1russell7/rigor-testkit/http`. `pushoverFetchTo` sends the requests of the builders of
 * `./pushover` to that server. `pushoverLedgerOf` reads the records of the server. Thus a fault proxy can
 * stand between a caller and the fake.
 *
 * `@mark1russell7/rigor-testkit` is an optional peer dependency. This entry imports only its types.
 */
import type { ScriptedReply, ScriptedRequest, ScriptedRoute, ScriptedServerOptions } from "@mark1russell7/rigor-testkit/http";
import { PUSHOVER_API, type PushoverFetch } from "../pushover.js";

/** The path of the version of the Pushover API, from `PUSHOVER_API`. */
const VERSION = new URL(PUSHOVER_API).pathname;

/** The state that each read of a receipt gives. */
export type PushoverReceiptState = "pending" | "acknowledged" | "expired";

/** The reply to one read of a receipt: its state, and the time of the acknowledgment in milliseconds since the epoch. */
export interface PushoverReceiptReply {
  readonly state: PushoverReceiptState;
  readonly acknowledgedAt?: number;
}

/** The options of the fake of the Pushover API. Each time is in milliseconds since the epoch. */
export interface PushoverApiOptions {
  /** The count of receipts. Send `n` gets the receipt `pushoverReceiptOf(n)`. A send after the last receipt gets the last receipt again. The default is 12. */
  readonly receipts?: number;
  /** The state of each receipt at each read. The default is `acknowledged`. */
  readonly state?: PushoverReceiptState;
  /** The time of the acknowledgment. With no time, the body has `0`, which Pushover gives for a time that did not occur. */
  readonly acknowledgedAt?: number;
  /**
   * The replies of receipt `pushoverReceiptOf(index)`, one at each read, in order. After the end, each read gives the last entry again.
   * Without this option, each read gives `state` and `acknowledgedAt`. An empty list throws a `RangeError`.
   */
  readonly receiptStates?: (index: number) => readonly PushoverReceiptReply[];
  /** The time at which the repeats stop. The default is 2100-01-01. */
  readonly expiresAt?: number;
  /** The tags that a cancel by tag stops. With `any`, each request that no route matches gets the success of a cancel. */
  readonly tags?: readonly string[] | "any";
  /** The monthly limit of the application, and the time of its reset. The default is 10000 messages and 2100-01-01. */
  readonly limit?: { readonly messages: number; readonly resetAt: number };
}

const YEAR_2100 = 4_102_444_800_000;
const seconds = (ms: number): number => Math.floor(ms / 1000);
const json = (body: object, fields: Readonly<Record<string, string>> = {}, status = 200): ScriptedReply => ({
  status,
  fields: { "content-type": "application/json", ...fields },
  body: JSON.stringify(body),
});

/** This function gives the receipt of send `index`: 30 letters and digits, as the Pushover API gives them. */
export function pushoverReceiptOf(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError(`The index ${String(index)} is not a safe integer of 0 or more.`);
  return `fakereceipt${String(index).padStart(19, "0")}`;
}

/**
 * This function gives the routes of a fake of the Pushover API, for `startScriptedServer` of
 * `@mark1russell7/rigor-testkit/http`. The fake has a route for the request of each builder of `./pushover`.
 *
 * - Each send gets the next receipt, also a send with a priority below 2. The headers of each send give the monthly limit.
 * - Each read of a receipt gives the same state, unless `receiptStates` gives the replies of that receipt.
 * - Each cancel of a receipt succeeds. A cancel by tag succeeds for each tag of `tags`.
 * - Each other request gets HTTP 404 with the body of an error of Pushover, unless `tags` is `any`.
 */
export function pushoverApi(options: PushoverApiOptions = {}): ScriptedServerOptions {
  const receipts = options.receipts ?? 12;
  if (!Number.isInteger(receipts) || receipts < 1) throw new RangeError(`The count of receipts (${String(receipts)}) is not an integer of 1 or more.`);
  const fixed: PushoverReceiptReply = {
    state: options.state ?? "acknowledged",
    ...(options.acknowledgedAt === undefined ? {} : { acknowledgedAt: options.acknowledgedAt }),
  };
  const expiresAt = options.expiresAt ?? YEAR_2100;
  const limit = options.limit ?? { messages: 10_000, resetAt: YEAR_2100 };
  const ids = Array.from({ length: receipts }, (_, index) => pushoverReceiptOf(index));
  const limits = (remaining: number): Readonly<Record<string, string>> => ({
    "x-limit-app-limit": String(limit.messages),
    "x-limit-app-remaining": String(Math.max(0, remaining)),
    "x-limit-app-reset": String(seconds(limit.resetAt)),
  });
  const receiptBody = (receipt: string, reply: PushoverReceiptReply): object => {
    const acknowledged = reply.state === "acknowledged";
    return {
      status: 1,
      request: `read-${receipt}`,
      acknowledged: acknowledged ? 1 : 0,
      acknowledged_at: acknowledged && reply.acknowledgedAt !== undefined ? seconds(reply.acknowledgedAt) : 0,
      ...(acknowledged ? { acknowledged_by: "fakeuser", acknowledged_by_device: "phone" } : {}),
      last_delivered_at: 0,
      expired: reply.state === "expired" ? 1 : 0,
      expires_at: seconds(expiresAt),
      called_back: 0,
      called_back_at: 0,
    };
  };
  // The scripted server gives the last reply of a route again after the end of its replies.
  const readReplies = (receipt: string, index: number): ScriptedReply[] => {
    const replies = options.receiptStates?.(index) ?? [fixed];
    if (replies.length === 0) throw new RangeError(`The replies of receipt ${String(index)} are an empty list. Give one reply or more.`);
    return replies.map((reply) => json(receiptBody(receipt, reply)));
  };
  const tags = options.tags === "any" ? [] : (options.tags ?? []);
  const routes: ScriptedRoute[] = [
    {
      method: "POST",
      path: `${VERSION}/messages.json`,
      replies: ids.map((receipt, index) => json({ status: 1, request: `send-${String(index)}`, receipt }, limits(limit.messages - index - 1))),
    },
    ...ids.flatMap((receipt, index): ScriptedRoute[] => [
      { method: "GET", path: `${VERSION}/receipts/${receipt}.json`, replies: readReplies(receipt, index) },
      { method: "POST", path: `${VERSION}/receipts/${receipt}/cancel.json`, replies: [json({ status: 1, request: `cancel-${receipt}` })] },
    ]),
    ...tags.map((tag): ScriptedRoute => ({ method: "POST", path: `${VERSION}/receipts/cancel_by_tag/${encodeURIComponent(tag)}.json`, replies: [json({ status: 1, request: `cancel-tag-${tag}` })] })),
    { method: "POST", path: `${VERSION}/users/validate.json`, replies: [json({ status: 1, request: "validate", group: 0, devices: ["phone"], licenses: ["iOS"] })] },
    { method: "GET", path: `${VERSION}/apps/limits.json`, replies: [json({ status: 1, request: "limits", limit: limit.messages, remaining: limit.messages, reset: seconds(limit.resetAt) })] },
  ];
  const unmatched =
    options.tags === "any" ? json({ status: 1, request: "cancel-tag" }) : json({ status: 0, request: "unmatched", errors: ["The fake of the Pushover API has no route for this request."] }, {}, 404);
  return { routes, unmatched };
}

/**
 * This function gives a fetch that sends each request of the builders of `./pushover` to the server at
 * `origin`, with the same path and query. A request to another address fails, as a network failure does.
 */
export function pushoverFetchTo(origin: string, fetch: PushoverFetch = globalThis.fetch): PushoverFetch {
  // A loop removes the slashes at the end. A regular expression such as /\/+$/ takes quadratic time on many slashes.
  let end = origin.length;
  while (end > 0 && origin.charCodeAt(end - 1) === 0x2f) end -= 1;
  const base = origin.slice(0, end);
  return (url, init) => {
    if (!url.startsWith(`${PUSHOVER_API}/`)) return Promise.reject(new TypeError(`The address ${url} is not an address of the Pushover API.`));
    return fetch(`${base}${VERSION}${url.slice(PUSHOVER_API.length)}`, init);
  };
}

/** One send that the fake read whole. Each position is the place of a request in the records of the server. */
export interface PushoverLedgerMessage {
  readonly receipt: string;
  /** The priority of the form, or 0 when the form has none. */
  readonly priority: number;
  readonly tags: readonly string[];
  readonly position: number;
  /** The connection of the send, as the server numbers them. */
  readonly connection: number;
  /** The position of the first read of the receipt. */
  readonly readAt?: number;
  /** The position of the first cancel after the send that reached the message: by its receipt, or by one of its tags. */
  readonly cancelledAt?: number;
}

/** What the fake got. */
export interface PushoverLedger {
  readonly messages: readonly PushoverLedgerMessage[];
  /** The count of the requests of each kind. `other` counts each request that is not a request of a builder of `./pushover`. */
  readonly counts: {
    readonly sends: number;
    readonly reads: number;
    readonly cancels: number;
    readonly tagCancels: number;
    readonly validates: number;
    readonly limits: number;
    readonly other: number;
  };
}

/**
 * This function reads the records of a scripted server with the routes of `pushoverApi`. A message of
 * the ledger is a send that the server read whole. Thus it counts also when its answer did not get to
 * the caller.
 */
export function pushoverLedgerOf(requests: readonly ScriptedRequest[]): PushoverLedger {
  const escaped = VERSION.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const READ = new RegExp(`^${escaped}/receipts/([A-Za-z0-9]{30})\\.json$`);
  const CANCEL = new RegExp(`^${escaped}/receipts/([A-Za-z0-9]{30})/cancel\\.json$`);
  const TAG_CANCEL = new RegExp(`^${escaped}/receipts/cancel_by_tag/([^/]+)\\.json$`);
  const sends: Omit<PushoverLedgerMessage, "readAt" | "cancelledAt">[] = [];
  const reads = new Map<string, number>();
  const cancels: { readonly position: number; readonly receipt?: string; readonly tag?: string }[] = [];
  const counts = { sends: 0, reads: 0, cancels: 0, tagCancels: 0, validates: 0, limits: 0, other: 0 };
  for (const [position, request] of requests.entries()) {
    const path = request.target.split("?")[0] ?? "";
    const post = request.method === "POST";
    const get = request.method === "GET";
    if (post && path === `${VERSION}/messages.json` && request.reply >= 0) {
      counts.sends += 1;
      const form = new URLSearchParams(request.body);
      const tags = (form.get("tags") ?? "").split(",").filter((tag) => tag !== "");
      sends.push({ receipt: pushoverReceiptOf(request.reply), priority: Number(form.get("priority") ?? "0"), tags, position, connection: request.connection });
      continue;
    }
    const read = get ? READ.exec(path) : null;
    if (read?.[1] !== undefined) {
      counts.reads += 1;
      if (!reads.has(read[1])) reads.set(read[1], position);
      continue;
    }
    const cancel = post ? CANCEL.exec(path) : null;
    if (cancel?.[1] !== undefined) {
      counts.cancels += 1;
      cancels.push({ position, receipt: cancel[1] });
      continue;
    }
    const byTag = post ? TAG_CANCEL.exec(path) : null;
    if (byTag?.[1] !== undefined) {
      counts.tagCancels += 1;
      cancels.push({ position, tag: decodeURIComponent(byTag[1]) });
      continue;
    }
    if (post && path === `${VERSION}/users/validate.json`) counts.validates += 1;
    else if (get && path === `${VERSION}/apps/limits.json`) counts.limits += 1;
    else counts.other += 1;
  }
  const messages = sends.map((send): PushoverLedgerMessage => {
    const readAt = reads.get(send.receipt);
    const cancelledAt = cancels.find((c) => c.position > send.position && (c.receipt === send.receipt || (c.tag !== undefined && send.tags.includes(c.tag))))?.position;
    return { ...send, ...(readAt === undefined ? {} : { readAt }), ...(cancelledAt === undefined ? {} : { cancelledAt }) };
  });
  return { messages, counts };
}
