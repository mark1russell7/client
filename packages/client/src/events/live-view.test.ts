/**
 * The reader of a live topic (LIVE-STATE-2026-11.md): the order of its subscription and its
 * snapshot, and a new read after a loss.
 */
import { describe, it, expect } from "vitest";
import type { LiveEntry, LiveEvent } from "./live-state.js";
import { liveView, type LiveClient } from "./live-view.js";
import type { RemoteEvent, RemoteEventHandler, SubscribeOptions, Subscription } from "./remote.js";

/** A read of a snapshot that the test ends. */
interface Read {
  answer(entries: LiveEntry[]): Promise<void>;
  fail(error: Error): Promise<void>;
}

/** A client whose subscription and reads the test drives. */
function fakeClient() {
  const reads: Read[] = [];
  const log: string[] = [];
  let handler: RemoteEventHandler<LiveEvent> | undefined;
  let options: SubscribeOptions = {};
  let stopped = 0;
  let confirm: () => void = () => undefined;
  let refuse: (error: Error) => void = () => undefined;
  const client: LiveClient = {
    subscribe<T>(_topics: string | readonly string[], next: RemoteEventHandler<T>, given: SubscribeOptions = {}): Subscription {
      log.push("subscribe");
      handler = next as unknown as RemoteEventHandler<LiveEvent>;
      options = given;
      const stop = (() => void stopped++) as unknown as { (): void; ready: Promise<void>; id: string };
      stop.ready = new Promise<void>((resolve, reject) => {
        confirm = resolve;
        refuse = reject;
      });
      stop.id = "s1";
      return stop;
    },
    call<_TReq, TRes>(): Promise<TRes> {
      log.push("read");
      return new Promise<TRes>((resolve, reject) => {
        reads.push({
          answer: async (entries) => {
            resolve({ entries } as unknown as TRes);
            await Promise.resolve();
            await Promise.resolve();
          },
          fail: async (error) => {
            reject(error);
            await Promise.resolve();
            await Promise.resolve();
          },
        });
      });
    },
  };
  let seq = 0;
  return {
    client,
    reads,
    log,
    stopped: () => stopped,
    subscribed: () => {
      confirm();
      options.onSubscribed?.(["live.room"]);
    },
    refuse: (error: Error) => refuse(error),
    emit: (event: Partial<LiveEvent>, dropped = 0) =>
      handler!({ origin: "o", set: [], gone: [], ...event }, { topic: "live.room", data: {}, seq: ++seq, dropped, subscription: "s1" } as RemoteEvent<LiveEvent>),
  };
}

const entry = (key: string, value: unknown): LiveEntry => ({ key, value, at: 1 });
const plain = (values: ReadonlyMap<string, LiveEntry>): Record<string, unknown> => Object.fromEntries([...values].map(([key, { value }]) => [key, value]));

describe("a live view", () => {
  it("subscribes first and reads the snapshot after the confirmation", async () => {
    const fake = fakeClient();
    const view = liveView(fake.client, "live.room");
    expect(fake.log).toEqual(["subscribe"]);
    fake.subscribed();
    expect(fake.log).toEqual(["subscribe", "read"]);
    await fake.reads[0]!.answer([entry("a", 1)]);
    await view.ready;
    expect(plain(view.values)).toEqual({ a: 1 });
  });

  it("applies the events that came during the read after the snapshot, in their order", async () => {
    const fake = fakeClient();
    const view = liveView(fake.client, "live.room");
    fake.subscribed();
    fake.emit({ set: [entry("a", 2)] });
    fake.emit({ gone: [{ key: "b", reason: "expired" }] });
    fake.emit({ set: [entry("a", 3)] });
    expect(view.values.size).toBe(0);
    await fake.reads[0]!.answer([entry("a", 1), entry("b", 1), entry("c", 1)]);
    expect(plain(view.values)).toEqual({ a: 3, c: 1 });
  });

  it("applies an event at once after the read, and tells each change", async () => {
    const fake = fakeClient();
    const changes: Array<Record<string, unknown>> = [];
    liveView(fake.client, "live.room", { onChange: (values) => changes.push(plain(values)) });
    fake.subscribed();
    await fake.reads[0]!.answer([entry("a", 1)]);
    fake.emit({ set: [entry("b", 1)] });
    fake.emit({ gone: [{ key: "a", reason: "closed" }] });
    expect(changes).toEqual([{ a: 1 }, { a: 1, b: 1 }, { b: 1 }]);
  });

  it("reads again after a loss of events, and drops a key that ended during the loss", async () => {
    const fake = fakeClient();
    const view = liveView(fake.client, "live.room");
    fake.subscribed();
    await fake.reads[0]!.answer([entry("a", 1), entry("b", 1)]);
    fake.emit({ set: [entry("c", 1)] }, 3);
    expect(fake.reads).toHaveLength(2);
    await fake.reads[1]!.answer([entry("a", 2)]);
    expect(plain(view.values)).toEqual({ a: 2, c: 1 });
  });

  it("reads again after a resubscribe, and replaces its values", async () => {
    const fake = fakeClient();
    const view = liveView(fake.client, "live.room");
    fake.subscribed();
    await fake.reads[0]!.answer([entry("a", 1)]);
    fake.subscribed();
    await fake.reads[1]!.answer([entry("b", 1)]);
    expect(plain(view.values)).toEqual({ b: 1 });
  });

  it("uses only the latest read when two reads overlap", async () => {
    const fake = fakeClient();
    const view = liveView(fake.client, "live.room");
    fake.subscribed();
    fake.subscribed();
    await fake.reads[1]!.answer([entry("new", 1)]);
    await fake.reads[0]!.answer([entry("old", 1)]);
    expect(plain(view.values)).toEqual({ new: 1 });
  });

  it("rejects ready when the first read fails, keeps its events, and tells the error", async () => {
    const fake = fakeClient();
    const errors: unknown[] = [];
    const view = liveView(fake.client, "live.room", { onReadError: (error) => errors.push(error) });
    fake.subscribed();
    fake.emit({ set: [entry("a", 1)] });
    const failure = new Error("no read");
    await fake.reads[0]!.fail(failure);
    await expect(view.ready).rejects.toBe(failure);
    expect(errors).toEqual([failure]);
    expect(plain(view.values)).toEqual({ a: 1 });
    fake.emit({ set: [entry("b", 1)] });
    expect(plain(view.values)).toEqual({ a: 1, b: 1 });
  });

  it("rejects ready when the first subscription fails", async () => {
    const fake = fakeClient();
    const view = liveView(fake.client, "live.room");
    const failure = new Error("refused");
    fake.refuse(failure);
    await expect(view.ready).rejects.toBe(failure);
  });

  it("ends its subscription at close, and ignores a late read", async () => {
    const fake = fakeClient();
    const view = liveView(fake.client, "live.room");
    fake.subscribed();
    view.close();
    expect(fake.stopped()).toBe(1);
    await fake.reads[0]!.answer([entry("a", 1)]);
    expect(view.values.size).toBe(0);
  });
});
