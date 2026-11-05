/**
 * The live state of a topic (LIVE-STATE-2026-11.md). A fake clock pins each expiry and each window,
 * and the tests wait for no real time.
 */
import { describe, it, expect } from "vitest";
import { fakeClock } from "@mark1russell7/service/testing";
import { invokeProcedure } from "../procedures/invoke.js";
import type { AnyProcedure } from "../procedures/types.js";
import type { Principal } from "../server/types.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { createRegistry } from "../procedures/module.js";
import { ms, seconds } from "../duration.js";
import { createEventBus } from "./bus.js";
import { EventPublisher, type EventPublisherOptions } from "./publisher.js";
import { liveTopic, liveTopicTarget, type AdmitLiveSet, type LiveEntry, type LiveEvent, type LiveState, type LiveStateOptions } from "./live-state.js";
import type { EventItem } from "./remote.js";
import type { EventBus } from "./types.js";

const open: AdmitLiveSet = () => ({});
const ann: Principal = { id: "ann", via: "test" };

interface Rig {
  readonly clock: ReturnType<typeof fakeClock>;
  readonly bus: EventBus;
  readonly publisher: EventPublisher;
  readonly live: LiveState;
  readonly heard: LiveEvent[];
}

/** A publisher with a live state, and a list of the events on the topic. */
function rig(options: Partial<LiveStateOptions> = {}, publisher: Partial<EventPublisherOptions> = {}, topic = "live.room", bus: EventBus = createEventBus(), clock = fakeClock()): Rig {
  const made = new EventPublisher({ bus, clock, topics: ["live.*"], ...publisher, live: { expiresAfter: seconds(30), admitSet: open, ...options } });
  const heard: LiveEvent[] = [];
  bus.on<LiveEvent>(topic, (event) => void heard.push(event));
  return { clock, bus, publisher: made, live: made.live!, heard };
}

/** The procedure of a live state with the name of its last segment. */
function procedureOf(live: LiveState, name: "set" | "snapshot" | "leave"): AnyProcedure {
  return live.procedures.find((procedure) => procedure.path[1] === name)!;
}

/** A call of a procedure of a live state, with its value. */
async function call<T>(live: LiveState, name: "set" | "snapshot" | "leave", input: unknown, options: Parameters<typeof invokeProcedure>[2] = {}): Promise<T> {
  const output = await invokeProcedure<T>(procedureOf(live, name), input, options);
  if (output.kind !== "value") throw new Error("a live procedure gives one value");
  return output.value;
}

const keysOf = (event: LiveEvent | undefined): string[] => (event?.set ?? []).map(({ key }) => key);
const valuesOf = (entries: readonly LiveEntry[]): Record<string, unknown> => Object.fromEntries(entries.map(({ key, value }) => [key, value]));

describe("a live topic", () => {
  it("gives back its name and its partition", () => {
    expect(liveTopic("presence")).toBe("live.presence");
    expect(liveTopic("a.b", "t/1.2")).toBe("live.a%2Eb.t/1.2");
    expect(liveTopicTarget("live.a%2Eb.t/1.2")).toEqual({ name: "a.b", partition: "t/1.2" });
    expect(liveTopicTarget("live.presence")).toEqual({ name: "presence" });
  });

  it("has one form: another topic and an alias are not live topics", () => {
    expect(liveTopicTarget("collections.notes")).toBeUndefined();
    expect(liveTopicTarget("live.")).toBeUndefined();
    expect(liveTopicTarget("live.a.")).toBeUndefined();
    expect(liveTopicTarget("live.a%2eb")).toBeUndefined();
  });
});

describe("the window of a live topic", () => {
  it("sends the first set on an idle topic at once", () => {
    const { live, heard } = rig();
    live.set("live.room", "a", 1);
    expect(heard.map(keysOf)).toEqual([["a"]]);
  });

  it("joins the sets in an open window: one event at its end, and the latest value of a key wins", async () => {
    const { live, heard, clock } = rig({ window: ms(120) });
    live.set("live.room", "a", 1);
    live.set("live.room", "a", 2);
    live.set("live.room", "b", 3);
    live.set("live.room", "a", 4);
    expect(heard).toHaveLength(1);
    await clock.advance(119);
    expect(heard).toHaveLength(1);
    await clock.advance(1);
    expect(heard).toHaveLength(2);
    expect(valuesOf(heard[1]!.set)).toEqual({ a: 4, b: 3 });
  });

  it("opens the next window at the joined event, and is idle after a window with no change", async () => {
    const { live, heard, clock } = rig({ window: ms(120) });
    live.set("live.room", "a", 1);
    live.set("live.room", "a", 2);
    await clock.advance(120);
    expect(heard).toHaveLength(2);
    // The joined event opened a window, so this set waits
    live.set("live.room", "a", 3);
    expect(heard).toHaveLength(2);
    await clock.advance(120);
    expect(heard).toHaveLength(3);
    // This window ends with no change, so the topic is idle and the next set goes at once
    await clock.advance(120);
    live.set("live.room", "a", 4);
    expect(heard).toHaveLength(4);
  });

  it("sends each set at once with a window of 0, and holds no timer for it", () => {
    const { live, heard, clock } = rig({ window: ms(0), expiresAfter: seconds(30) });
    live.set("live.room", "a", 1);
    live.set("live.room", "a", 2);
    expect(heard).toHaveLength(2);
    // Only the timer of the deadlines
    expect(clock.pending).toBe(1);
  });

  it("takes a window for each topic from a function", async () => {
    const { live, heard, clock } = rig({ window: (topic) => (topic === "live.room" ? ms(50) : ms(500)) });
    live.set("live.room", "a", 1);
    live.set("live.room", "a", 2);
    await clock.advance(50);
    expect(heard).toHaveLength(2);
  });

  it("removes a set that waits when its key ends, and a key that comes back has no gone", async () => {
    const { live, heard, clock } = rig({ window: ms(120) });
    live.set("live.room", "other", 0, { owner: "c0" });
    live.set("live.room", "a", 1, { owner: "c1" });
    live.connectionClosed("c1");
    await clock.advance(120);
    expect(keysOf(heard[1])).toEqual([]);
    expect(heard[1]!.gone).toEqual([{ key: "a", reason: "closed" }]);

    live.set("live.room", "b", 1, { owner: "c2" });
    live.connectionClosed("c2");
    live.set("live.room", "b", 2, { owner: "c3" });
    await clock.advance(120);
    expect(valuesOf(heard[2]!.set)).toEqual({ b: 2 });
    expect(heard[2]!.gone).toEqual([]);
  });
});

describe("a snapshot", () => {
  it("gives the live values at once, also while a set waits in the window", () => {
    const { live } = rig();
    live.set("live.room", "a", 1);
    live.set("live.room", "a", 2);
    live.set("live.room", "b", { x: 1 }, { by: "ann" });
    expect(valuesOf(live.snapshot("live.room"))).toEqual({ a: 2, b: { x: 1 } });
    expect(live.snapshot("live.room").find(({ key }) => key === "b")?.by).toBe("ann");
    expect(live.snapshot("live.other")).toEqual([]);
  });
});

describe("the end of a key", () => {
  it("ends a key at the stated time with no set, and publishes gone", async () => {
    const { live, heard, clock } = rig({ expiresAfter: seconds(30), window: ms(0) });
    live.set("live.room", "a", 1);
    await clock.advance(29_999);
    expect(live.size).toBe(1);
    await clock.advance(1);
    expect(live.size).toBe(0);
    expect(heard.at(-1)!.gone).toEqual([{ key: "a", reason: "expired" }]);
    expect(live.snapshot("live.room")).toEqual([]);
  });

  it("moves the deadline at each set", async () => {
    const { live, clock } = rig({ expiresAfter: seconds(30) });
    live.set("live.room", "a", 1);
    await clock.advance(20_000);
    live.set("live.room", "a", 2);
    await clock.advance(20_000);
    expect(live.size).toBe(1);
    await clock.advance(10_000);
    expect(live.size).toBe(0);
  });

  it("ends only the keys at their deadline, in the order of the last set", async () => {
    const { live, clock } = rig({ expiresAfter: seconds(30) });
    live.set("live.room", "a", 1);
    await clock.advance(10_000);
    live.set("live.room", "b", 1);
    await clock.advance(20_000);
    expect(valuesOf(live.snapshot("live.room"))).toEqual({ b: 1 });
    await clock.advance(10_000);
    expect(live.size).toBe(0);
  });

  it("holds no timer when no key is live", async () => {
    const { live, clock } = rig({ expiresAfter: seconds(30), window: ms(120) });
    live.set("live.room", "a", 1);
    await clock.advance(30_120);
    await clock.advance(120);
    expect(live.size).toBe(0);
    expect(clock.pending).toBe(0);
  });

  it("ends the keys of a connection at its close, and publishes gone", () => {
    const { live, heard } = rig({ window: ms(0) });
    live.set("live.room", "a", 1, { owner: "c1" });
    live.set("live.room", "b", 1, { owner: "c1" });
    live.set("live.room", "c", 1, { owner: "c2" });
    live.connectionClosed("c1");
    expect(Object.keys(valuesOf(live.snapshot("live.room")))).toEqual(["c"]);
    expect(heard.flatMap(({ gone }) => gone)).toEqual([{ key: "a", reason: "closed" }, { key: "b", reason: "closed" }]);
    live.connectionClosed("c1");
    expect(live.size).toBe(1);
  });

  it("has the connection of the last set as the owner", () => {
    const { live } = rig();
    live.set("live.room", "a", 1, { owner: "c1" });
    live.set("live.room", "a", 2, { owner: "c2" });
    live.connectionClosed("c1");
    expect(live.size).toBe(1);
    live.connectionClosed("c2");
    expect(live.size).toBe(0);
  });

  it("holds nothing after close, and a set is refused", async () => {
    const { live, publisher, clock } = rig();
    live.set("live.room", "a", 1);
    live.set("live.room", "b", 1);
    publisher.end();
    expect(clock.pending).toBe(0);
    expect(live.snapshot("live.room")).toEqual([]);
    expect(() => live.set("live.room", "a", 1)).toThrow(/closed/);
    await clock.advance(60_000);
    expect(live.size).toBe(0);
  });
});

describe("a leave call", () => {
  const connection = (id: string): Parameters<typeof invokeProcedure>[2] => ({ metadata: { connectionId: id } });

  it("ends the key of the connection of its last set, with the reason left, at once on an idle topic", async () => {
    const { live, heard, clock } = rig();
    await call(live, "set", { topic: "live.room", key: "a", value: 1 }, connection("c1"));
    await clock.advance(120);
    heard.length = 0;
    await expect(call(live, "leave", { topic: "live.room", key: "a" }, connection("c1"))).resolves.toEqual({ ended: true });
    expect(heard.map(({ gone }) => gone)).toEqual([[{ key: "a", reason: "left" }]]);
    expect(live.snapshot("live.room")).toEqual([]);
    expect(live.size).toBe(0);
  });

  it("joins the window of the topic, and the latest change of the key wins", async () => {
    const { live, heard, clock } = rig();
    live.set("live.room", "first", 1);
    live.set("live.room", "a", 1, { owner: "c1" });
    await call(live, "leave", { topic: "live.room", key: "a" }, connection("c1"));
    live.set("live.room", "b", 2, { owner: "c1" });
    await call(live, "leave", { topic: "live.room", key: "b" }, connection("c1"));
    expect(heard).toHaveLength(1);
    await clock.advance(120);
    expect(heard[1]?.set).toEqual([]);
    expect(heard[1]?.gone).toEqual([{ key: "a", reason: "left" }, { key: "b", reason: "left" }]);
  });

  it("refuses another connection and a call with no connection, without a rule", async () => {
    const { live, heard, clock } = rig();
    await call(live, "set", { topic: "live.room", key: "a", value: 1 }, connection("c1"));
    await clock.advance(120);
    heard.length = 0;
    await expect(call(live, "leave", { topic: "live.room", key: "a" }, connection("c2"))).rejects.toMatchObject({ code: "FORBIDDEN", reason: "write-not-allowed" });
    await expect(call(live, "leave", { topic: "live.room", key: "a" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(heard).toEqual([]);
    expect(live.size).toBe(1);
  });

  it("asks admitLeave in place of the connection, with the name of the last set", async () => {
    const seen: unknown[] = [];
    const { live } = rig({
      admitSet: ({ principal }) => ({ by: principal?.id }),
      admitLeave: ({ key, by, owner, principal }) => {
        seen.push({ key, by, owner, principal: principal?.id });
        return by === principal?.id;
      },
    });
    await call(live, "set", { topic: "live.room", key: "a", value: 1 }, { principal: ann, metadata: { connectionId: "c1" } });
    await expect(call(live, "leave", { topic: "live.room", key: "a" }, { principal: { id: "bob", via: "test" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(live, "leave", { topic: "live.room", key: "a" }, { principal: ann })).resolves.toEqual({ ended: true });
    expect(seen[1]).toEqual({ key: "a", by: "ann", owner: "c1", principal: "ann" });
  });

  it("keeps a key that a set renewed during the check of the right", async () => {
    let release: (allowed: boolean) => void = () => undefined;
    let asked: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => { asked = resolve; });
    const { live, clock, heard } = rig({
      admitLeave: () => new Promise<boolean>((resolve) => {
        release = resolve;
        asked();
      }),
    });
    live.set("live.room", "a", 1);
    await clock.advance(120);
    heard.length = 0;
    const leaving = call(live, "leave", { topic: "live.room", key: "a" });
    await reached;
    live.set("live.room", "a", 2);
    release(true);
    await expect(leaving).resolves.toEqual({ ended: false });
    expect(valuesOf(live.snapshot("live.room"))).toEqual({ a: 2 });
  });

  it("reports a key that is not live, and asks no rule", async () => {
    let asked = 0;
    const { live, heard } = rig({ admitLeave: () => { asked += 1; return true; } });
    await expect(call(live, "leave", { topic: "live.room", key: "none" })).resolves.toEqual({ ended: false });
    expect(asked).toBe(0);
    expect(heard).toEqual([]);
  });

  it("runs the checks of a subscription first", async () => {
    let asked = 0;
    const { live } = rig({ admitLeave: () => { asked += 1; return true; } }, { allow: () => false });
    live.set("live.room", "a", 1);
    await expect(call(live, "leave", { topic: "live.room", key: "a" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(asked).toBe(0);
    expect(live.size).toBe(1);
  });

  it("ends the deadline and the owner of the key", async () => {
    const { live, heard, clock } = rig();
    live.set("live.room", "a", 1, { owner: "c1" });
    expect(live.leave("live.room", "a")).toBe(true);
    expect(live.leave("live.room", "a")).toBe(false);
    await clock.advance(120);
    heard.length = 0;
    live.connectionClosed("c1");
    await clock.advance(30_000);
    expect(heard).toEqual([]);
    expect(clock.pending).toBe(0);
  });

  it("reaches the other host of a bus", async () => {
    const bus = createEventBus();
    const one = rig({}, {}, "live.room", bus);
    const two = rig({}, {}, "live.room", bus);
    two.live.snapshot("live.room");
    one.live.set("live.room", "a", 1);
    expect(two.live.size).toBe(1);
    expect(two.live.leave("live.room", "a")).toBe(true);
    await two.clock.advance(120);
    await one.clock.advance(120);
    expect(one.live.size).toBe(0);
  });
});

describe("the limits", () => {
  it("refuses a new key at the limit, and the existing values stay", () => {
    const { live } = rig({ maxKeysPerTopic: 2 });
    live.set("live.room", "a", 1);
    live.set("live.room", "b", 1);
    expect(() => live.set("live.room", "c", 1)).toThrow(expect.objectContaining({ code: "FORBIDDEN", reason: "write-not-allowed" }));
    live.set("live.room", "a", 2);
    expect(valuesOf(live.snapshot("live.room"))).toEqual({ a: 2, b: 1 });
  });

  it("counts the bytes of a value as JSON, also for a character with more than one byte", () => {
    const { live } = rig({ maxValueBytes: 12 });
    // "é" is 2 bytes: the JSON text of 5 of them has 7 characters and 12 bytes
    live.set("live.room", "fits", "ééééé");
    expect(() => live.set("live.room", "over", "éééééé")).toThrow(/more than 12 bytes/);
    expect(() => live.set("live.room", "long", "x".repeat(13))).toThrow(/more than 12 bytes/);
    expect(() => live.set("live.room", "none", undefined)).toThrow(/JSON form/);
    expect(live.size).toBe(1);
  });

  it("refuses a new topic at the limit, unless a topic without a key can go", async () => {
    const bus = createEventBus();
    const { live, clock } = rig({ maxTopics: 2, expiresAfter: seconds(30) }, {}, "live.a", bus);
    live.set("live.a", "k", 1);
    live.set("live.b", "k", 1);
    expect(() => live.set("live.c", "k", 1)).toThrow(/limit of 2 topics/);
    expect(live.snapshot("live.c")).toEqual([]);

    await clock.advance(30_240);
    expect(live.size).toBe(0);
    const before = bus.subscriberCount("live.b");
    live.set("live.c", "k", 1);
    expect(live.size).toBe(1);
    expect(bus.subscriberCount("live.b")).toBeLessThan(before);
  });
});

describe("the default limits, one under and one over", () => {
  const refused = expect.objectContaining({ code: "FORBIDDEN", reason: "write-not-allowed" });

  it("takes 1,024 keys on a topic and refuses a new key after them, and the existing values stay", () => {
    const { live } = rig();
    for (let key = 0; key < 1024; key++) live.set("live.room", `k${key}`, key);
    expect(live.size).toBe(1024);
    expect(() => live.set("live.room", "k1024", 1)).toThrow(refused);
    expect(() => live.set("live.room", "k1024", 1)).toThrow(/limit of 1024 keys/);
    live.set("live.room", "k0", "new");
    expect(live.size).toBe(1024);
    expect(valuesOf(live.snapshot("live.room"))["k0"]).toBe("new");
  });

  it("takes a value of 16,384 bytes as JSON and refuses a value of 16,385 bytes", () => {
    const { live } = rig();
    // The two quotes of the JSON text add 2 bytes
    live.set("live.room", "fits", "x".repeat(16382));
    expect(() => live.set("live.room", "over", "x".repeat(16383))).toThrow(refused);
    expect(() => live.set("live.room", "over", "x".repeat(16383))).toThrow(/more than 16384 bytes/);
    expect(live.size).toBe(1);
  });

  it("takes 4,096 topics and refuses a new topic while each has a key or an open window", async () => {
    const bus = createEventBus();
    const { live, clock } = rig({}, {}, "live.heard", bus);
    for (let topic = 0; topic < 4096; topic++) live.set(`live.t${topic}`, "k", 1);
    expect(live.size).toBe(4096);
    expect(() => live.set("live.over", "k", 1)).toThrow(refused);
    expect(() => live.set("live.over", "k", 1)).toThrow(/limit of 4096 topics/);

    // The end of the key leaves its window open, so the topic stays
    await clock.advance(120);
    expect(live.leave("live.t0", "k")).toBe(true);
    expect(() => live.set("live.over", "k", 1)).toThrow(refused);

    // The window ended, so the topic with no key goes for the new topic
    const before = bus.subscriberCount("live.t0");
    await clock.advance(120);
    live.set("live.over", "k", 1);
    expect(live.size).toBe(4096);
    expect(bus.subscriberCount("live.t0")).toBeLessThan(before);
  });
});

describe("the rights of a set and a snapshot", () => {
  it("stamps who set the value, and the value of the caller cannot replace the name", async () => {
    const { live } = rig({ admitSet: ({ principal }) => ({ by: principal?.id }) });
    await call(live, "set", { topic: "live.room", key: "a", value: { by: "mallory" } }, { principal: ann });
    expect(live.snapshot("live.room")[0]).toMatchObject({ key: "a", by: "ann", value: { by: "mallory" } });
  });

  it("keeps the value of the admission in place of the value of the caller", async () => {
    const { live } = rig({ admitSet: ({ value, principal }) => ({ value: { ...(value as object), owner: principal?.id } }) });
    await call(live, "set", { topic: "live.room", key: "a", value: { x: 1, owner: "mallory" } }, { principal: ann });
    expect(live.snapshot("live.room")[0]?.value).toEqual({ x: 1, owner: "ann" });
  });

  it("applies the limit of the bytes to the value of the admission", async () => {
    const { live } = rig({ maxValueBytes: 8, admitSet: () => ({ value: "x".repeat(100) }) });
    await expect(call(live, "set", { topic: "live.room", key: "a", value: 1 })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "write-not-allowed" });
    expect(live.size).toBe(0);
  });

  it("refuses a set when admitSet gives null", async () => {
    const { live } = rig({ admitSet: () => null });
    await expect(call(live, "set", { topic: "live.room", key: "a", value: 1 })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "write-not-allowed" });
    expect(live.size).toBe(0);
  });

  it("needs the option admitSet", () => {
    expect(() => new EventPublisher({ bus: createEventBus(), topics: ["live.*"], live: { expiresAfter: seconds(1) } as LiveStateOptions })).toThrow(/admitSet/);
  });

  it("names the owner from the connection of the call", async () => {
    const { live } = rig();
    await call(live, "set", { topic: "live.room", key: "a", value: 1 }, { metadata: { connectionId: "c1" } });
    live.connectionClosed("c1");
    expect(live.size).toBe(0);
  });

  it("refuses a set and a snapshot outside the topic rule, and for a refusal of allow", async () => {
    const allowed = new Set(["ann"]);
    const { live } = rig({}, { topics: ["live.room"], allow: (_topic, { principal }) => principal !== undefined && allowed.has(principal.id) });
    await expect(call(live, "set", { topic: "live.other", key: "a", value: 1 }, { principal: ann })).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND" });
    await expect(call(live, "snapshot", { topic: "live.other" }, { principal: ann })).rejects.toMatchObject({ code: "TOPIC_NOT_FOUND" });
    await expect(call(live, "set", { topic: "live.room", key: "a", value: 1 })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "topic-not-allowed" });
    await expect(call(live, "snapshot", { topic: "live.room" })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "topic-not-allowed" });

    await call(live, "set", { topic: "live.room", key: "a", value: 1 }, { principal: ann });
    allowed.delete("ann");
    await expect(call(live, "set", { topic: "live.room", key: "a", value: 2 }, { principal: ann })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "topic-not-allowed" });
    expect(valuesOf(live.snapshot("live.room"))).toEqual({ a: 1 });
  });

  it("refuses a topic of the rule that is not a live topic", async () => {
    const { live } = rig({}, { topics: ["orders.*"] });
    await expect(call(live, "set", { topic: "orders.created", key: "a", value: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(live, "snapshot", { topic: "orders.created" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("the partition of a live topic", () => {
  /** A rig whose rule gives each principal its own partition, and refuses a call without a principal. */
  const tenanted = () => rig({ partition: (ctx) => ctx.principal?.id ?? null });

  it("resolves the partition of a set and a snapshot: a caller cannot name the partition of another tenant", async () => {
    const { live } = tenanted();
    await call(live, "set", { topic: "live.room.bob", key: "a", value: 1 }, { principal: ann });
    expect(live.snapshot("live.room.ann")).toHaveLength(1);
    expect(live.snapshot("live.room.bob")).toHaveLength(0);
    expect(await call(live, "snapshot", { topic: "live.room.bob" }, { principal: ann })).toMatchObject({ entries: [{ key: "a" }] });
  });

  it("refuses a call when the rule gives null", async () => {
    const { live } = tenanted();
    await expect(call(live, "set", { topic: "live.room.ann", key: "a", value: 1 })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "partition-not-allowed" });
  });

  it("refuses a topic with a partition without a rule", async () => {
    const { live } = rig();
    await expect(call(live, "set", { topic: "live.room.ann", key: "a", value: 1 })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "partition-not-allowed" });
  });

  it("gives a subscriber the events of its partition, and a re-check ends it when its partition changes", async () => {
    let partition = "t1";
    const bus = createEventBus();
    const { live, publisher } = rig({ partition: () => partition, window: ms(0) }, {}, "live.none", bus);
    const controller = new AbortController();
    const output = await invokeProcedure(publisher.procedure, { topics: ["live.room.other"] }, { bus, signal: controller.signal });
    if (output.kind !== "stream") throw new Error("events.subscribe gives a stream");
    const items = output.items as AsyncGenerator<EventItem, void, undefined>;
    expect((await items.next()).value).toMatchObject({ type: "subscribed" });

    live.set("live.room.t2", "theirs", 1);
    live.set("live.room.t1", "ours", 1);
    expect((await items.next()).value).toMatchObject({ type: "event", topic: "live.room.other", data: { set: [{ key: "ours" }] } });

    partition = "t2";
    const ended = expect(items.next()).rejects.toMatchObject({ code: "FORBIDDEN", reason: "partition-not-allowed" });
    await publisher.rightsChanged();
    await ended;
  });
});

describe("two hosts on one bus", () => {
  /** Two publishers on one bus, each with its clock. */
  function hosts(options: Partial<LiveStateOptions> = {}) {
    const bus = createEventBus();
    const one = rig({ window: ms(0), ...options }, {}, "live.room", bus);
    const two = rig({ window: ms(0), ...options }, {}, "live.room", bus);
    // A first snapshot starts the listener of each host
    one.live.snapshot("live.room");
    two.live.snapshot("live.room");
    return { one, two };
  }

  it("fills the state of the second host from the bus", () => {
    const { one, two } = hosts();
    one.live.set("live.room", "a", 1, { by: "ann" });
    expect(two.live.snapshot("live.room")).toMatchObject([{ key: "a", value: 1, by: "ann" }]);
  });

  it("publishes each change one time: a host does not publish what it heard", () => {
    const { one, two } = hosts();
    one.live.set("live.room", "a", 1);
    expect(two.heard).toHaveLength(1);
    expect(one.heard).toHaveLength(1);
  });

  it("removes a key on the second host at the gone of the closed connection", () => {
    const { one, two } = hosts();
    one.live.set("live.room", "a", 1, { owner: "c1" });
    one.live.connectionClosed("c1");
    expect(two.live.size).toBe(0);
  });

  it("ends a key of a dead host at its own deadline: a key lives at most one stated time after its owner", async () => {
    const { one, two } = hosts({ expiresAfter: seconds(30) });
    one.live.set("live.room", "a", 1, { owner: "c1" });
    one.publisher.end();
    expect(two.live.size).toBe(1);
    await two.clock.advance(30_000);
    expect(two.live.size).toBe(0);
  });

  it("does not let a close on the second host end a key that the first host owns", () => {
    const { one, two } = hosts();
    two.live.set("live.room", "a", 1, { owner: "c1" });
    one.live.set("live.room", "a", 2, { owner: "c2" });
    two.live.connectionClosed("c1");
    expect(two.live.size).toBe(1);
  });

  it("ignores a value of another form on a live topic", () => {
    const { two } = hosts();
    two.bus.emit("live.room", { not: "an event" });
    expect(two.live.size).toBe(0);
  });
});

describe("a server with a live state", () => {
  /** A server with a live state and an expose rule. */
  const serverOf = (expose?: (path: readonly string[]) => boolean): ProcedureServer =>
    new ProcedureServer({ registry: createRegistry(), events: { bus: createEventBus(), topics: ["live.*"], live: { expiresAfter: seconds(30), admitSet: open } }, ...(expose ? { expose } : {}) });

  it("gives no live procedure without the option", () => {
    expect(new EventPublisher({ bus: createEventBus(), topics: ["live.*"] }).live).toBeUndefined();
  });

  it("serves live.set and live.snapshot", () => {
    const server = serverOf();
    expect(server.publisher!.live!.procedures.map(({ path }) => path.join("."))).toEqual(["live.set", "live.snapshot", "live.leave"]);
    expect(server.procedureOf({ service: "live", operation: "leave" })).toBeDefined();
    expect(server.procedureOf({ service: "live", operation: "set" })).toBeDefined();
    expect(server.procedureOf({ service: "live", operation: "snapshot" })).toBeDefined();
  });

  it("keeps its expose rule on the live procedures: only events.subscribe stays on", () => {
    const server = serverOf((path) => path[0] !== "live");
    expect(server.procedureOf({ service: "live", operation: "set" })).toBeUndefined();
    expect(server.procedureOf({ service: "live", operation: "snapshot" })).toBeUndefined();
    expect(server.procedureOf({ service: "events", operation: "subscribe" })).toBeDefined();
  });
});
