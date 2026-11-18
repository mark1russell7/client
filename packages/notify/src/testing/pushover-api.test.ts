import { startScriptedServer, type ScriptedServer } from "@mark1russell7/rigor-testkit/http";
import { afterEach, describe, expect, it } from "vitest";
import {
  callPushover,
  extractPushoverCancelled,
  extractPushoverLimits,
  extractPushoverReceipt,
  extractPushoverSent,
  extractPushoverValidated,
  pushoverCancelByTagRequest,
  pushoverCancelRequest,
  pushoverLimitsRequest,
  pushoverReceiptRequest,
  pushoverSendRequest,
  pushoverValidateRequest,
} from "../pushover.js";
import { pushoverApi, pushoverFetchTo, pushoverLedgerOf, pushoverReceiptOf, type PushoverApiOptions } from "./index.js";

// The keys are made up: 30 letters and digits, as the keys of Pushover are.
const TOKEN = `faketoken${"0".repeat(21)}`;
const USER = `fakeuser${"0".repeat(22)}`;
const TAG = "incident-1";
const LIMIT = { timeoutMs: 5000 };

let server: ScriptedServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const start = async (options?: PushoverApiOptions) => {
  server = await startScriptedServer(pushoverApi(options));
  return { server, fetch: pushoverFetchTo(server.url) };
};
const emergency = (tags: readonly string[] = [TAG]) => pushoverSendRequest(TOKEN, { user: USER, message: "Take shelter now.", priority: 2, emergency: { retryMs: 30_000, expireMs: 3_600_000, tags } });

describe("pushoverApi", () => {
  it("gives a scripted reply to the request of each builder, and each extractor reads it", async () => {
    const { server: fake, fetch } = await start({ tags: [TAG], acknowledgedAt: 1_800_000_000_000 });
    const sent = await callPushover(fetch, emergency(), extractPushoverSent, LIMIT);
    expect(sent).toMatchObject({ ok: true, request: "send-0", receipt: pushoverReceiptOf(0), limits: { limit: 10_000, remaining: 9_999 } });
    const receipt = pushoverReceiptOf(0);
    expect(await callPushover(fetch, pushoverReceiptRequest(TOKEN, receipt), extractPushoverReceipt, LIMIT)).toMatchObject({
      ok: true,
      acknowledged: true,
      acknowledgedAt: 1_800_000_000_000,
      acknowledgedByDevice: "phone",
      expired: false,
      expiresAt: 4_102_444_800_000,
    });
    expect(await callPushover(fetch, pushoverCancelRequest(TOKEN, receipt), extractPushoverCancelled, LIMIT)).toMatchObject({ ok: true });
    expect(await callPushover(fetch, pushoverCancelByTagRequest(TOKEN, TAG), extractPushoverCancelled, LIMIT)).toMatchObject({ ok: true });
    expect(await callPushover(fetch, pushoverValidateRequest(TOKEN, USER), extractPushoverValidated, LIMIT)).toEqual({ ok: true, group: false, devices: ["phone"], licenses: ["iOS"] });
    expect(await callPushover(fetch, pushoverLimitsRequest(TOKEN), extractPushoverLimits, LIMIT)).toEqual({ ok: true, limits: { limit: 10_000, remaining: 10_000, resetAt: 4_102_444_800_000 } });
    const ledger = pushoverLedgerOf(fake.requests);
    expect(ledger.counts).toEqual({ sends: 1, reads: 1, cancels: 1, tagCancels: 1, validates: 1, limits: 1, other: 0 });
    expect(ledger.messages).toEqual([{ receipt, priority: 2, tags: [TAG], position: 0, connection: expect.any(Number), readAt: 1, cancelledAt: 2 }]);
  });

  it("gives the next receipt to each send, then the last receipt again", async () => {
    const { server: fake, fetch } = await start({ receipts: 2 });
    const receipts = [];
    for (let index = 0; index < 3; index += 1) {
      const sent = await callPushover(fetch, emergency(), extractPushoverSent, LIMIT);
      receipts.push(sent.ok ? sent.receipt : sent.kind);
    }
    expect(receipts).toEqual([pushoverReceiptOf(0), pushoverReceiptOf(1), pushoverReceiptOf(1)]);
    expect(pushoverLedgerOf(fake.requests).messages.map((message) => message.receipt)).toEqual(receipts);
  });

  it("gives the state of each receipt: pending and expired", async () => {
    const pending = await start({ state: "pending" });
    expect(await callPushover(pending.fetch, pushoverReceiptRequest(TOKEN, pushoverReceiptOf(0)), extractPushoverReceipt, LIMIT)).toMatchObject({ ok: true, acknowledged: false, expired: false });
    await pending.server.close();
    const expired = await start({ state: "expired", expiresAt: 1_800_000_000_000 });
    expect(await callPushover(expired.fetch, pushoverReceiptRequest(TOKEN, pushoverReceiptOf(0)), extractPushoverReceipt, LIMIT)).toMatchObject({ ok: true, acknowledged: false, expired: true, expiresAt: 1_800_000_000_000 });
  });

  it("gives the replies of each receipt in order, then the last reply again", async () => {
    const acknowledgedAt = 1_800_000_000_000;
    const { server: fake, fetch } = await start({
      receipts: 2,
      receiptStates: (index) => (index === 0 ? [{ state: "pending" }, { state: "acknowledged", acknowledgedAt }] : [{ state: "expired" }]),
    });
    const read = async (index: number) => callPushover(fetch, pushoverReceiptRequest(TOKEN, pushoverReceiptOf(index)), extractPushoverReceipt, LIMIT);
    expect(await read(0)).toMatchObject({ ok: true, acknowledged: false, expired: false });
    expect(await read(1)).toMatchObject({ ok: true, acknowledged: false, expired: true });
    expect(await read(0)).toMatchObject({ ok: true, acknowledged: true, acknowledgedAt, expired: false });
    expect(await read(0)).toMatchObject({ ok: true, acknowledged: true, acknowledgedAt, expired: false });
    expect(await read(1)).toMatchObject({ ok: true, acknowledged: false, expired: true });
    expect(pushoverLedgerOf(fake.requests).counts).toMatchObject({ reads: 5, other: 0 });
  });

  it("gives state and acknowledgedAt at each read without receiptStates", async () => {
    const acknowledgedAt = 1_800_000_000_000;
    const { fetch } = await start({ state: "acknowledged", acknowledgedAt });
    for (let count = 0; count < 2; count += 1) {
      expect(await callPushover(fetch, pushoverReceiptRequest(TOKEN, pushoverReceiptOf(0)), extractPushoverReceipt, LIMIT)).toMatchObject({ ok: true, acknowledged: true, acknowledgedAt, expired: false });
    }
  });

  it("refuses a cancel of a tag that it does not know, unless the tags are any", async () => {
    const strict = await start({ tags: [TAG] });
    expect(await callPushover(strict.fetch, pushoverCancelByTagRequest(TOKEN, "other"), extractPushoverCancelled, LIMIT)).toMatchObject({ ok: false, kind: "refused", status: 404 });
    expect(pushoverLedgerOf(strict.server.requests).counts).toMatchObject({ tagCancels: 1, other: 0 });
    await strict.server.close();
    const loose = await start({ tags: "any" });
    expect(await callPushover(loose.fetch, pushoverCancelByTagRequest(TOKEN, "other"), extractPushoverCancelled, LIMIT)).toMatchObject({ ok: true });
  });

  it("throws for a count of receipts below 1", () => {
    expect(() => pushoverApi({ receipts: 0 })).toThrow(RangeError);
    expect(() => pushoverReceiptOf(-1)).toThrow(RangeError);
  });

  it("throws for an empty list of replies of a receipt", () => {
    expect(() => pushoverApi({ receiptStates: () => [] })).toThrow(RangeError);
    expect(() => pushoverApi({ receipts: 2, receiptStates: (index) => (index === 1 ? [] : [{ state: "pending" }]) })).toThrow(/receipt 1/);
  });
});

describe("pushoverFetchTo", () => {
  it("keeps the path and the query, and refuses an address outside the Pushover API", async () => {
    const calls: string[] = [];
    const fetch = pushoverFetchTo("http://127.0.0.1:9/", async (url) => {
      calls.push(url);
      return { status: 200, text: async () => "{}", headers: { get: () => null } };
    });
    await fetch("https://api.pushover.net/1/receipts/x.json?token=t", { method: "GET", headers: {}, signal: new AbortController().signal });
    expect(calls).toEqual(["http://127.0.0.1:9/1/receipts/x.json?token=t"]);
    const slashes = pushoverFetchTo(`http://127.0.0.1:9${"/".repeat(100_000)}`, async (url) => {
      calls.push(url);
      return { status: 200, text: async () => "{}", headers: { get: () => null } };
    });
    await slashes("https://api.pushover.net/1/apps/limits.json?token=t", { method: "GET", headers: {}, signal: new AbortController().signal });
    expect(calls[1]).toBe("http://127.0.0.1:9/1/apps/limits.json?token=t");
    await expect(fetch("https://example.com/1/messages.json", { method: "POST", headers: {}, signal: new AbortController().signal })).rejects.toThrow(TypeError);
  });
});

describe("pushoverLedgerOf", () => {
  it("counts a cancel by tag only after the send, and only for a tag of the message", async () => {
    const { server: fake, fetch } = await start({ tags: "any" });
    await callPushover(fetch, pushoverCancelByTagRequest(TOKEN, TAG), extractPushoverCancelled, LIMIT);
    await callPushover(fetch, emergency(), extractPushoverSent, LIMIT);
    await callPushover(fetch, pushoverCancelByTagRequest(TOKEN, "other"), extractPushoverCancelled, LIMIT);
    expect(pushoverLedgerOf(fake.requests).messages[0]?.cancelledAt).toBeUndefined();
    await callPushover(fetch, pushoverCancelByTagRequest(TOKEN, TAG), extractPushoverCancelled, LIMIT);
    expect(pushoverLedgerOf(fake.requests).messages[0]?.cancelledAt).toBe(3);
  });
});
