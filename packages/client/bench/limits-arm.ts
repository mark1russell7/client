/**
 * One child of the bench of the live limits (roadmap CLI-101): `--case <id> --job <n> --counts <file>`. The child
 * needs `--expose-gc`. It prints the JSON line of `freshRun`, and adds its record to the counts file.
 *
 * The frame of a subscriber stops at `JSON.stringify`: no socket is in this bench. The time of a real socket write
 * is not measured.
 */

import { appendFileSync } from "node:fs";
import { getHeapStatistics } from "node:v8";
import { parseArgs } from "node:util";
import { median } from "@mark1russell7/rigor-statistics";
import { minutes } from "../src/duration.js";
import { createEventBus } from "../src/events/bus.js";
import type { LiveState } from "../src/events/live-state.js";
import { EventPublisher } from "../src/events/publisher.js";
import type { EventItem } from "../src/events/remote.js";
import { invokeProcedure } from "../src/procedures/invoke.js";
import type { AnyProcedure } from "../src/procedures/types.js";
import { KEYS, VALUE_BYTES, parseCase, valueText } from "./limits-cases.js";

const { values } = parseArgs({ options: { case: { type: "string" }, job: { type: "string" }, counts: { type: "string" } } });
if (values.case === undefined || values.counts === undefined) throw new RangeError("this child needs --case and --counts");
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("this child needs --expose-gc");
const id = values.case;
const spec = parseCase(id);

const TOPIC = "live.room";
const bus = createEventBus();
const publisher = new EventPublisher({ bus, topics: ["live.*"], live: { expiresAfter: minutes(30), admitSet: () => ({}) } });
const live = publisher.live as LiveState;

/** The procedure of the live state with the given last segment. */
const procedureOf = (name: "set" | "snapshot"): AnyProcedure => live.procedures.find((procedure) => procedure.path[1] === name)!;

/** The heap after a full collection, in bytes. */
function heapNow(): number {
  gc!();
  gc!();
  return process.memoryUsage().heapUsed;
}

/** This function fills topics with keys, each with its own value. */
function fill(topics: number, keys: number, bytes: number, round = 0): void {
  for (let t = 0; t < topics; t++) {
    const topic = topics === 1 ? TOPIC : `${TOPIC}${t}`;
    for (let k = 0; k < keys; k++) live.set(topic, `k${k}`, JSON.parse(valueText(bytes, (round * topics + t) * keys + k)));
  }
}

const record: Record<string, unknown> = { case: id, arm: "edge", job: values.job ?? "0", heapLimit: getHeapStatistics().heap_size_limit };
let ms: number;
let hash: string;

const nextTask = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
const sleep = (time: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, time));

switch (spec.kind) {
  case "heap":
  case "topics": {
    const topics = spec.topics;
    const keys = spec.kind === "heap" ? KEYS : 1;
    const bytes = spec.kind === "heap" ? spec.bytes : 256;
    const before = heapNow();
    const start = performance.now();
    fill(topics, keys, bytes);
    ms = performance.now() - start;
    const after = heapNow();
    record["keys"] = topics * keys;
    record["heapBytes"] = after - before;
    record["heapPerKey"] = (after - before) / (topics * keys);
    record["heapPerTopic"] = (after - before) / topics;
    hash = String(live.size);
    break;
  }
  case "set": {
    const set = procedureOf("set");
    const count = spec.bytes > 1024 ? 10_000 : 40_000;
    const pool = Array.from({ length: 256 }, (_, n) => JSON.parse(valueText(spec.bytes, n, spec.wide)) as unknown);
    const call = (n: number): Promise<unknown> => invokeProcedure(set, { topic: TOPIC, key: `k${n % 100}`, value: pool[n % pool.length] });
    for (let n = 0; n < 2_000; n++) await call(n);
    const start = performance.now();
    for (let n = 0; n < count; n++) await call(n);
    ms = performance.now() - start;
    record["calls"] = count;
    record["setUs"] = (ms * 1000) / count;
    record["valueBytes"] = Buffer.byteLength(valueText(spec.bytes, 0, spec.wide));
    hash = String(live.snapshot(TOPIC).length);
    break;
  }
  case "snapshot": {
    fill(1, KEYS, VALUE_BYTES);
    const snapshot = procedureOf("snapshot");
    const calls: number[] = [];
    const texts: number[] = [];
    let bytes = 0;
    for (let n = 0; n < 7; n++) {
      const start = performance.now();
      const output = await invokeProcedure(snapshot, { topic: TOPIC });
      const called = performance.now();
      const text = JSON.stringify(output.kind === "value" ? output.value : null);
      const done = performance.now();
      bytes = Buffer.byteLength(text);
      // The first two are the warm-up
      if (n >= 2) {
        calls.push(called - start);
        texts.push(done - called);
      }
    }
    record["snapshotBytes"] = bytes;
    record["snapshotCallMs"] = median(calls);
    record["stringifyMs"] = median(texts);
    ms = median(calls.map((call, n) => call + texts[n]!));
    // The digits of the times can change the bytes: the hash is the count of the entries
    hash = String(live.snapshot(TOPIC).length);
    break;
  }
  case "window": {
    let frames = 0;
    let target = 0;
    let delivered: (() => void) | undefined;
    let bytes = 0;
    const controller = new AbortController();
    for (let s = 0; s < spec.subscribers; s++) {
      const output = await invokeProcedure(publisher.procedure, { topics: [TOPIC] }, { signal: controller.signal });
      if (output.kind !== "stream") throw new Error("events.subscribe gives a stream");
      const items = output.items as AsyncGenerator<EventItem, void, undefined>;
      await items.next();
      void (async () => {
        for await (const item of items) {
          bytes += JSON.stringify(item).length;
          if (++frames === target) delivered?.();
        }
      })();
    }
    let published = 0;
    let eventKeys = 0;
    bus.on<{ set?: unknown[] }>(TOPIC, (event) => {
      if ((event.set?.length ?? 0) > 1) {
        published = performance.now();
        eventKeys = event.set!.length;
      }
    });
    const pools = [0, 1].map((round) => Array.from({ length: KEYS }, (_, k) => JSON.parse(valueText(VALUE_BYTES, round * KEYS + k)) as unknown));
    const blocks: number[] = [];
    const totals: number[] = [];
    for (let round = 0; round < 5; round++) {
      const pool = pools[round % 2]!;
      // The first set on an idle topic goes at once and opens the window
      frames = 0;
      target = spec.subscribers;
      let first = new Promise<void>((resolve) => (delivered = resolve));
      live.set(TOPIC, "k0", pool[0]);
      await first;
      // The other keys wait in the window. One event at its end carries them all
      frames = 0;
      target = spec.subscribers;
      first = new Promise<void>((resolve) => (delivered = resolve));
      for (let k = 1; k < KEYS; k++) live.set(TOPIC, `k${k}`, pool[k]);
      await nextTask();
      let longest = 0;
      let probing = true;
      let last = performance.now();
      const probe = (): void => {
        const now = performance.now();
        longest = Math.max(longest, now - last);
        last = now;
        if (probing) setImmediate(probe);
      };
      setImmediate(probe);
      await first;
      const end = performance.now();
      await nextTask();
      await nextTask();
      probing = false;
      // The first two rounds are the warm-up
      if (round >= 2) {
        blocks.push(longest);
        totals.push(end - published);
      }
      // The window after the event ends, so the topic is idle again
      await sleep(400);
    }
    controller.abort();
    record["eventKeys"] = eventKeys;
    record["blockMs"] = median(blocks);
    record["blockMaxMs"] = Math.max(...blocks);
    record["deliverMs"] = median(totals);
    record["frameBytes"] = bytes;
    ms = Math.max(...blocks);
    hash = String(eventKeys);
    break;
  }
}

record["ms"] = ms;
appendFileSync(values.counts, `${JSON.stringify(record)}\n`);
console.log(JSON.stringify({ ms, hash }));
process.exit(0);
