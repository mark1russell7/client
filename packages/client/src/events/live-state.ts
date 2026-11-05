/**
 * The live state of a topic (documentation/LIVE-STATE-2026-11.md).
 *
 * Some state changes many times a second, and each reader needs only its latest value: who is here,
 * and where a cursor is. This state keeps the latest value of each key of a topic in memory. It
 * makes no store write and no numbered change.
 *
 * - A set keeps the value and publishes it to the subscribers of the topic, through the bus. The
 *   first change on an idle topic goes at once and opens a window. One event at the end of the
 *   window carries each key that changed in it, and that event opens the next window.
 * - A snapshot gives the live values, so a new reader sees them at once.
 * - A key ends after a stated time with no set, when the connection of its owner closes, and at a
 *   leave call. Each end publishes a `gone` item.
 *
 * The state fills from the bus too. A bus that hosts share thus shares the state. A snapshot holds
 * only what this host saw.
 */
import * as z from "zod";
import { createProcedure } from "../procedures/define.js";
import { InvocationError } from "../procedures/invoke.js";
import { decodeSegment, encodeSegment } from "../procedures/segments.js";
import type { PartitionResolver } from "../procedures/collection/partition.js";
import type { AnyProcedure, Capability, ProcedureContext } from "../procedures/types.js";
import type { Principal } from "../server/types.js";
import { ms, toMs, type Duration } from "../duration.js";
import { realClock, type Cancel, type Clock } from "../clock.js";
import type { EventBus, Unsubscribe } from "./types.js";

/** The path of the procedure that sets a key of a live topic. */
export const LIVE_SET_PATH: readonly string[] = ["live", "set"];
/** The path of the procedure that gives the live values of a topic. */
export const LIVE_SNAPSHOT_PATH: readonly string[] = ["live", "snapshot"];
/** The path of the procedure that ends a key of a live topic. */
export const LIVE_LEAVE_PATH: readonly string[] = ["live", "leave"];
/** The longest key of a live topic, in characters. */
export const MAX_LIVE_KEY_LENGTH = 256;
/** The default limit of the keys of one live topic. */
export const DEFAULT_LIVE_KEYS = 1024;
/** The default limit of the bytes of one value, as JSON. */
export const DEFAULT_LIVE_VALUE_BYTES = 16384;
/** The default limit of the topics of one live state. */
export const DEFAULT_LIVE_TOPICS = 4096;

/** The prefix of each live topic. */
const PREFIX = "live.";
/** The default window that joins the sets of a topic, in milliseconds. */
const DEFAULT_WINDOW_MS = 120;

/** The live value of a key. */
export interface LiveEntry<T = unknown> {
  /** The key. */
  readonly key: string;
  /** The latest value. */
  readonly value: T;
  /** The name from `admitSet`. A value from the caller cannot replace it. */
  readonly by?: string | undefined;
  /** The time of the set on the clock of the host that took it, in milliseconds. */
  readonly at: number;
}

/** Why a key ended: no set for the stated time, the connection of its owner closed, or a leave call ended it. */
export type LiveGoneReason = "expired" | "closed" | "left";

/** The end of a key. */
export interface LiveGone {
  /** The key. */
  readonly key: string;
  /** Why the key ended. */
  readonly reason: LiveGoneReason;
}

/**
 * The event of a live topic: each key that changed in one window. The two lists have no key in
 * common, and the latest change of a key wins.
 */
export interface LiveEvent<T = unknown> {
  /** The id of the live state that published the event. A live state ignores its own events. */
  readonly origin: string;
  /** The keys with a new value. */
  readonly set: ReadonlyArray<LiveEntry<T>>;
  /** The keys that ended. */
  readonly gone: readonly LiveGone[];
}

/** The facts of a set, for `admitSet`. */
export interface LiveSetCall {
  /** The topic of the bus, after the partition rule. */
  readonly topic: string;
  /** The key. */
  readonly key: string;
  /** The value of the caller. */
  readonly value: unknown;
  /** The capability of the call. */
  readonly capability: Capability;
  /** The metadata of the call: the connection id and the headers of a network request. */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** The principal of the call, from the authentication of the host. */
  readonly principal?: Principal | undefined;
}

/** What `admitSet` gives for a set that it admits. */
export interface LiveAdmission {
  /** The name of who set the value. Each reader gets it, and a value from the caller cannot replace it. */
  readonly by?: string | undefined;
  /** The value to keep in place of the value of the caller, when this field is present: a value with owner fields, for example. */
  readonly value?: unknown;
}

/** The right to set a key. An admission admits the set. Null refuses it with `FORBIDDEN` and the reason `write-not-allowed`. */
export type AdmitLiveSet = (call: LiveSetCall) => LiveAdmission | null | Promise<LiveAdmission | null>;

/** The facts of a leave call, for `admitLeave`. */
export interface LiveLeaveCall {
  /** The topic of the bus, after the partition rule. */
  readonly topic: string;
  /** The key. */
  readonly key: string;
  /** The name that `admitSet` gave for the last set of the key. */
  readonly by?: string | undefined;
  /** The connection of the last set of the key on this host. */
  readonly owner?: string | undefined;
  /** The capability of the call. */
  readonly capability: Capability;
  /** The metadata of the call: the connection id and the headers of a network request. */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** The principal of the call, from the authentication of the host. */
  readonly principal?: Principal | undefined;
}

/** The right to end a key. False refuses the call with `FORBIDDEN` and the reason `write-not-allowed`. */
export type AdmitLiveLeave = (call: LiveLeaveCall) => boolean | Promise<boolean>;

/** The options of a live state. */
export interface LiveStateOptions {
  /** The time with no set after which a key ends. Only the app knows how often its clients repeat. */
  expiresAfter: Duration;
  /** The right to set a key, with the name and the value to keep. A host must give this option, so each host states who can write. */
  admitSet: AdmitLiveSet;
  /**
   * The right to end a key with `live.leave`. Without this rule, only the connection of the last
   * set of a key on this host can end the key.
   */
  admitLeave?: AdmitLiveLeave | undefined;
  /**
   * The window that joins the changes of a topic into one event, or a function that gives the window
   * of a topic of the bus. The first change on an idle topic goes at once. `ms(0)` publishes each
   * change at once.
   * @default ms(120)
   */
  window?: Duration | ((topic: string) => Duration) | undefined;
  /**
   * The rule of the partition of a live topic, as for a collection. Null refuses the call. Without
   * this rule, a topic with a partition gets `FORBIDDEN`.
   */
  partition?: PartitionResolver | undefined;
  /**
   * The limit of the keys of one topic. A set of a new key at the limit gets `FORBIDDEN`.
   * @default DEFAULT_LIVE_KEYS
   */
  maxKeysPerTopic?: number | undefined;
  /**
   * The limit of the bytes of one value, as JSON. A larger value gets `FORBIDDEN`.
   * @default DEFAULT_LIVE_VALUE_BYTES
   */
  maxValueBytes?: number | undefined;
  /**
   * The limit of the topics. A set on a new topic at the limit gets `FORBIDDEN`, unless a topic
   * without a key can go.
   * @default DEFAULT_LIVE_TOPICS
   */
  maxTopics?: number | undefined;
  /**
   * The clock of the deadlines and of the window. A test gives the `fakeClock` of
   * `@mark1russell7/service/testing`.
   * @default the clock of the publisher
   */
  clock?: Clock | undefined;
}

/** The parts of a publisher that a live state uses. */
export interface LiveStateHost {
  /** The bus of the events. */
  readonly bus: EventBus;
  /** The clock, when the options give none. */
  readonly clock?: Clock | undefined;
  /** The schema of a topic of the publisher. */
  readonly topicSchema: z.ZodString;
  /** This function runs the checks of a subscription on a topic, and gives the topic of the bus. */
  admit(topic: string, ctx: ProcedureContext): Promise<string>;
}

/** The options of a direct set by the host. */
export interface LiveSetOptions {
  /** The name of who set the value. */
  readonly by?: string | undefined;
  /** The connection that owns the key: its close ends the key. */
  readonly owner?: string | undefined;
}

/**
 * This function gives a live topic: `live.<name>`, or `live.<name>.<partition>`. The name encodes
 * `%` and `.`, so the first dot after the name ends the name, as in a topic of a collection.
 *
 * @example
 * ```typescript
 * liveTopic("presence"); // "live.presence"
 * liveTopic("presence", "acme/board:b1"); // "live.presence.acme/board:b1"
 * ```
 */
export function liveTopic(name: string, partition?: string): string {
  const topic = `${PREFIX}${encodeSegment(name)}`;
  return partition === undefined ? topic : `${topic}.${partition}`;
}

/**
 * This function gives the name and the partition of a live topic, or undefined for another topic.
 * Only the canonical form counts: `liveTopic()` gives the same topic back.
 */
export function liveTopicTarget(topic: string): { readonly name: string; readonly partition?: string } | undefined {
  if (!topic.startsWith(PREFIX)) return undefined;
  const rest = topic.slice(PREFIX.length);
  const dot = rest.indexOf(".");
  const name = decodeSegment(dot === -1 ? rest : rest.slice(0, dot));
  if (name.length === 0) return undefined;
  if (dot === -1) return liveTopic(name) === topic ? { name } : undefined;
  const partition = rest.slice(dot + 1);
  if (partition.length === 0) return undefined;
  return liveTopic(name, partition) === topic ? { name, partition } : undefined;
}

/** A live key. */
interface Slot {
  readonly state: TopicState;
  readonly key: string;
  entry: LiveEntry;
  deadline: number;
  owner: string | undefined;
}

/** The changes of a topic that wait for the end of its window. */
interface Waiting {
  readonly set: Map<string, LiveEntry>;
  readonly gone: Map<string, LiveGone>;
}

/** The state of a topic. */
interface TopicState {
  readonly topic: string;
  readonly keys: Map<string, Slot>;
  readonly stop: Unsubscribe;
  readonly windowMs: number;
  waiting: Waiting | undefined;
  /** This field holds the timer of the open window. It is undefined when the topic is idle. */
  window: Cancel | undefined;
}

/** True for a value of the form of a live event. */
function isLiveEvent(value: unknown): value is LiveEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Partial<LiveEvent>;
  return typeof event.origin === "string" && Array.isArray(event.set) && Array.isArray(event.gone);
}

/** This function gives a refusal of a set. */
function refused(message: string, reason: "write-not-allowed" | "partition-not-allowed", path: readonly string[] = LIVE_SET_PATH): InvocationError {
  return new InvocationError("FORBIDDEN", message, [...path], reason);
}

/** This function gives a new id for a live state. */
function newOrigin(): string {
  const random = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  return random ? random.call((globalThis as unknown as { crypto: unknown }).crypto) : `live-${Date.now()}-${Math.random()}`;
}

const entrySchema = z.object({
  key: z.string(),
  value: z.unknown(),
  by: z.string().optional(),
  at: z.number(),
});

/**
 * The live values of the topics of one publisher. A host gets one with the option `live` of
 * `EventPublisher`, and the server registers its `procedures`.
 */
export class LiveState {
  /** The procedures `live.set`, `live.snapshot` and `live.leave`. The expose rule of the host applies to them. */
  readonly procedures: readonly AnyProcedure[];

  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly admit: LiveStateHost["admit"];
  private readonly admitSet: AdmitLiveSet;
  private readonly admitLeave: AdmitLiveLeave | undefined;
  private readonly partition: PartitionResolver | undefined;
  private readonly expiresMs: number;
  private readonly windowOf: (topic: string) => Duration;
  private readonly maxKeys: number;
  private readonly maxValueBytes: number;
  private readonly maxTopics: number;
  private readonly origin = newOrigin();
  private readonly topics = new Map<string, TopicState>();
  /** Each key in the order of its last set. All keys have the same time, so this is the order of the deadlines. */
  private readonly deadlines = new Set<Slot>();
  private readonly owned = new Map<string, Set<Slot>>();
  private timer: Cancel | undefined;
  private closed = false;

  constructor(options: LiveStateOptions, host: LiveStateHost) {
    if (typeof options.admitSet !== "function") throw new TypeError("LiveState needs the option admitSet");
    this.bus = host.bus;
    this.clock = options.clock ?? host.clock ?? realClock;
    this.admit = host.admit;
    this.admitSet = options.admitSet;
    this.admitLeave = options.admitLeave;
    this.partition = options.partition;
    this.expiresMs = toMs(options.expiresAfter, "expiresAfter");
    if (this.expiresMs <= 0) throw new RangeError("expiresAfter must be more than 0");
    const window = options.window ?? ms(DEFAULT_WINDOW_MS);
    this.windowOf = typeof window === "function" ? window : () => window;
    this.maxKeys = options.maxKeysPerTopic ?? DEFAULT_LIVE_KEYS;
    this.maxValueBytes = options.maxValueBytes ?? DEFAULT_LIVE_VALUE_BYTES;
    this.maxTopics = options.maxTopics ?? DEFAULT_LIVE_TOPICS;
    this.procedures = [this.setProcedure(host.topicSchema), this.snapshotProcedure(host.topicSchema), this.leaveProcedure(host.topicSchema)];
  }

  /** The number of live keys of this state. */
  get size(): number {
    return this.deadlines.size;
  }

  /**
   * The topic of the bus for a live topic of a call, or undefined for another topic. The publisher
   * calls it for each subscription and each re-check, so a change of the partition ends a
   * subscription.
   */
  async route(topic: string, ctx: ProcedureContext): Promise<string | undefined> {
    const target = liveTopicTarget(topic);
    if (!target) return undefined;
    if (!this.partition) {
      if (target.partition !== undefined) throw refused(`The live topic "${topic}" has no partitions`, "partition-not-allowed");
      return topic;
    }
    const partition = await this.partition(ctx, target.partition);
    if (partition === null) throw refused(`The call cannot use the partition of the live topic "${topic}"`, "partition-not-allowed");
    return liveTopic(target.name, partition);
  }

  /**
   * This method keeps the latest value of a key and publishes it. This is the direct form for the
   * host: it runs no check of a right, and `topic` is a topic of the bus.
   *
   * @returns The time of the set on the clock
   * @throws `InvocationError` with the code `FORBIDDEN` at a limit, and the existing values stay
   */
  set(topic: string, key: string, value: unknown, options: LiveSetOptions = {}): number {
    if (this.closed) throw refused("The live state is closed", "write-not-allowed");
    this.checkValue(value);
    const state = this.stateOf(topic);
    if (!state) throw refused(`The live state has its limit of ${this.maxTopics} topics`, "write-not-allowed");
    const at = this.clock.now();
    const entry: LiveEntry = options.by === undefined ? { key, value, at } : { key, value, by: options.by, at };
    let slot = state.keys.get(key);
    if (slot) {
      slot.entry = entry;
    } else {
      if (state.keys.size >= this.maxKeys) throw refused(`The live topic "${topic}" has its limit of ${this.maxKeys} keys`, "write-not-allowed");
      slot = { state, key, entry, deadline: 0, owner: undefined };
      state.keys.set(key, slot);
    }
    this.renew(slot, at);
    this.own(slot, options.owner);
    this.queue(state, (waiting) => {
      waiting.gone.delete(key);
      waiting.set.set(key, entry);
    });
    return at;
  }

  /** This method gives the live values of a topic of the bus. */
  snapshot(topic: string): LiveEntry[] {
    if (this.closed) return [];
    const state = this.stateOf(topic);
    return state ? Array.from(state.keys.values(), (slot) => slot.entry) : [];
  }

  /**
   * This method ends a key and publishes the end with the reason `left`. This is the direct form for
   * the host: it runs no check of a right, and `topic` is a topic of the bus.
   *
   * @returns True when the key was live
   */
  leave(topic: string, key: string): boolean {
    const slot = this.topics.get(topic)?.keys.get(key);
    if (this.closed || !slot) return false;
    this.end(slot, "left", true);
    return true;
  }

  /** This method ends each key that the connection owns. The transport of the host calls it at a close. */
  connectionClosed(connection: string): void {
    const slots = this.owned.get(connection);
    if (!slots) return;
    this.owned.delete(connection);
    for (const slot of slots) {
      slot.owner = undefined;
      this.end(slot, "closed", true);
    }
  }

  /** This method stops the timers and the listeners. The state then holds nothing. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.timer?.();
    this.timer = undefined;
    for (const state of this.topics.values()) {
      state.window?.();
      state.stop();
    }
    this.topics.clear();
    this.deadlines.clear();
    this.owned.clear();
  }

  /** This method refuses a value above the limit. A text has at most 3 bytes for each UTF-16 unit. */
  private checkValue(value: unknown): void {
    const text = JSON.stringify(value);
    if (text === undefined) throw refused("A live value must have a JSON form", "write-not-allowed");
    const fits = text.length * 3 <= this.maxValueBytes
      || (text.length <= this.maxValueBytes && new TextEncoder().encode(text).length <= this.maxValueBytes);
    if (!fits) throw refused(`A live value has more than ${this.maxValueBytes} bytes`, "write-not-allowed");
  }

  /**
   * The state of a topic. The first use starts the listener of the bus. A topic stays after its
   * last key, and goes when a new topic needs its place. Undefined means that no place is free.
   */
  private stateOf(topic: string): TopicState | undefined {
    const known = this.topics.get(topic);
    if (known) return known;
    if (this.topics.size >= this.maxTopics) {
      for (const state of this.topics.values()) {
        if (state.keys.size === 0 && !state.window) {
          state.stop();
          this.topics.delete(state.topic);
        }
      }
      if (this.topics.size >= this.maxTopics) return undefined;
    }
    const stop = this.bus.on<unknown>(topic, (event) => this.heard(topic, event));
    const state: TopicState = { topic, keys: new Map(), stop, windowMs: toMs(this.windowOf(topic), "window"), waiting: undefined, window: undefined };
    this.topics.set(topic, state);
    return state;
  }

  /** This method applies an event of another host. Its subscribers on this host got it from the bus. */
  private heard(topic: string, event: unknown): void {
    if (this.closed || !isLiveEvent(event) || event.origin === this.origin) return;
    const state = this.topics.get(topic);
    if (!state) return;
    const now = this.clock.now();
    for (const entry of event.set) {
      let slot = state.keys.get(entry.key);
      if (slot) {
        slot.entry = entry;
      } else {
        if (state.keys.size >= this.maxKeys) continue;
        slot = { state, key: entry.key, entry, deadline: 0, owner: undefined };
        state.keys.set(entry.key, slot);
      }
      // The connection of this key is on the other host: its deadline ends the key if that host dies
      this.own(slot, undefined);
      this.renew(slot, now);
    }
    for (const { key, reason } of event.gone) {
      const slot = state.keys.get(key);
      if (slot) this.end(slot, reason, false);
    }
  }

  /** This method moves a key to the end of the deadlines. */
  private renew(slot: Slot, now: number): void {
    slot.deadline = now + this.expiresMs;
    this.deadlines.delete(slot);
    this.deadlines.add(slot);
    this.armDeadline();
  }

  /** This method sets the owner of a key. The owner is the connection of the last set. */
  private own(slot: Slot, owner: string | undefined): void {
    if (slot.owner === owner) return;
    if (slot.owner !== undefined) {
      const slots = this.owned.get(slot.owner);
      slots?.delete(slot);
      if (slots?.size === 0) this.owned.delete(slot.owner);
    }
    slot.owner = owner;
    if (owner === undefined) return;
    const slots = this.owned.get(owner);
    if (slots) slots.add(slot);
    else this.owned.set(owner, new Set([slot]));
  }

  /** This method removes a key, and publishes its end when this host decided it. */
  private end(slot: Slot, reason: LiveGoneReason, publish: boolean): void {
    this.own(slot, undefined);
    this.deadlines.delete(slot);
    slot.state.keys.delete(slot.key);
    if (!publish) return;
    this.queue(slot.state, (waiting) => {
      waiting.set.delete(slot.key);
      waiting.gone.set(slot.key, { key: slot.key, reason });
    });
  }

  /** This method starts the one timer of the deadlines, at the first deadline. */
  private armDeadline(): void {
    if (this.timer || this.closed) return;
    const first = this.deadlines.values().next();
    if (first.done) return;
    const timer = this.clock.after(Math.max(0, first.value.deadline - this.clock.now()), () => {
      this.timer = undefined;
      this.expire();
    });
    // A deadline does not keep a Node process alive
    timer.unref?.();
    this.timer = timer;
  }

  /** This method ends each key at its deadline. */
  private expire(): void {
    const now = this.clock.now();
    for (const slot of this.deadlines) {
      if (slot.deadline > now) break;
      this.end(slot, "expired", true);
    }
    this.armDeadline();
  }

  /**
   * This method adds a change to a topic. On an idle topic the change goes at once, so one writer
   * has no added delay, and the window opens. In an open window the change waits, and the latest
   * change of a key wins.
   */
  private queue(state: TopicState, change: (waiting: Waiting) => void): void {
    let waiting = state.waiting;
    if (!waiting) {
      waiting = { set: new Map(), gone: new Map() };
      state.waiting = waiting;
    }
    change(waiting);
    if (!state.window) this.publishWaiting(state);
  }

  /** This method publishes the changes that wait as one event, and opens the next window. */
  private publishWaiting(state: TopicState): void {
    const waiting = state.waiting;
    if (!waiting || this.closed) return;
    state.waiting = undefined;
    if (state.windowMs > 0) {
      const timer = this.clock.after(state.windowMs, () => {
        state.window = undefined;
        this.publishWaiting(state);
      });
      timer.unref?.();
      state.window = timer;
    }
    const event: LiveEvent = { origin: this.origin, set: [...waiting.set.values()], gone: [...waiting.gone.values()] };
    this.bus.emit(state.topic, event);
  }

  /** The procedure `live.set`: the checks of a subscription, then `admitSet`, then the set. */
  private setProcedure(topicSchema: z.ZodString): AnyProcedure {
    return createProcedure()
      .path([...LIVE_SET_PATH])
      .input(z.object({
        topic: topicSchema,
        key: z.string().min(1).max(MAX_LIVE_KEY_LENGTH).describe("The key of the value"),
        value: z.unknown().refine((value) => value !== undefined, "A live set needs a value").describe("The latest value of the key"),
      }))
      .output(z.object({ at: z.number().describe("The time of the set on the clock of the host") }))
      .meta({
        description: "This procedure keeps the latest value of a key of a live topic and publishes it. It makes no store write.",
        effects: { reads: ["events"], writes: ["live"] },
      })
      .handler(async (input: { topic: string; key: string; value?: unknown }, ctx: ProcedureContext) => {
        const topic = await this.admit(input.topic, ctx);
        if (!liveTopicTarget(topic)) throw refused(`The topic "${input.topic}" is not a live topic`, "write-not-allowed");
        const admission = await this.admitSet({
          topic,
          key: input.key,
          value: input.value,
          capability: ctx.capability,
          metadata: ctx.metadata,
          ...(ctx.principal ? { principal: ctx.principal } : {}),
        });
        if (admission === null) throw refused(`The call cannot set a key of the live topic "${input.topic}"`, "write-not-allowed");
        const connection = ctx.metadata["connectionId"];
        const owner = typeof connection === "string" ? connection : undefined;
        // A connection that closed during the checks owns no new key
        if (ctx.signal?.aborted) throw refused("The call ended before the set", "write-not-allowed");
        const value = admission.value !== undefined ? admission.value : input.value;
        return { at: this.set(topic, input.key, value, { by: admission.by, owner }) };
      })
      .build() as AnyProcedure;
  }

  /**
   * The procedure `live.leave`: the checks of a subscription, then the right to end the key. A set
   * that comes during the check of the right keeps the key, because the check read the older set.
   */
  private leaveProcedure(topicSchema: z.ZodString): AnyProcedure {
    return createProcedure()
      .path([...LIVE_LEAVE_PATH])
      .input(z.object({
        topic: topicSchema,
        key: z.string().min(1).max(MAX_LIVE_KEY_LENGTH).describe("The key to end"),
      }))
      .output(z.object({ ended: z.boolean().describe("True when the call ended a live key") }))
      .meta({
        description: "This procedure ends a key of a live topic. Each reader gets the end at once, or at the end of an open window.",
        effects: { reads: ["events"], writes: ["live"] },
      })
      .handler(async (input: { topic: string; key: string }, ctx: ProcedureContext) => {
        const topic = await this.admit(input.topic, ctx);
        if (!liveTopicTarget(topic)) throw refused(`The topic "${input.topic}" is not a live topic`, "write-not-allowed", LIVE_LEAVE_PATH);
        const slot = this.topics.get(topic)?.keys.get(input.key);
        if (!slot) return { ended: false };
        const { entry, owner } = slot;
        const allowed = this.admitLeave
          ? await this.admitLeave({
              topic,
              key: input.key,
              by: entry.by,
              owner,
              capability: ctx.capability,
              metadata: ctx.metadata,
              ...(ctx.principal ? { principal: ctx.principal } : {}),
            })
          : owner !== undefined && owner === ctx.metadata["connectionId"];
        if (!allowed) throw refused(`The call cannot end a key of the live topic "${input.topic}"`, "write-not-allowed", LIVE_LEAVE_PATH);
        if (slot.entry !== entry || this.topics.get(topic)?.keys.get(input.key) !== slot) return { ended: false };
        return { ended: this.leave(topic, input.key) };
      })
      .build() as AnyProcedure;
  }

  /** The procedure `live.snapshot`: the checks of a subscription, then the live values. */
  private snapshotProcedure(topicSchema: z.ZodString): AnyProcedure {
    return createProcedure()
      .path([...LIVE_SNAPSHOT_PATH])
      .input(z.object({ topic: topicSchema }))
      .output(z.object({ entries: z.array(entrySchema).describe("The live values of the topic") }))
      .meta({
        description: "This procedure gives the live values of a topic. A new subscriber reads it after its subscription starts.",
        effects: { reads: ["events"], writes: [] },
      })
      .handler(async (input: { topic: string }, ctx: ProcedureContext) => {
        const topic = await this.admit(input.topic, ctx);
        if (!liveTopicTarget(topic)) throw refused(`The topic "${input.topic}" is not a live topic`, "write-not-allowed");
        return { entries: this.snapshot(topic) };
      })
      .build() as AnyProcedure;
  }
}
