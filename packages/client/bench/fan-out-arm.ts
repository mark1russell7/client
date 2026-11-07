/**
 * One arm of the fan-out bench, in its own process: `--arm plain|sliced --case <id>`. A case is
 * `block-<subscribers>` or `total-<subscribers>`. The child opens real subscriptions of `events.subscribe`,
 * with the output validation and a JSON frame for each item, and publishes one event several times.
 * It prints the JSON line of `freshRun`.
 *
 * - `block`: the worst gap between two tasks of the event loop during one publish. Microtasks count.
 * - `total`: the median time from the publish to the last frame.
 *
 * All subscriptions share one signal, as callers in one process with one stop signal do. Each server face gives each
 * call its own signal.
 *
 * The frame stops at `JSON.stringify`: no socket is in this bench. The time of a real socket write
 * is not measured. The `hash` is the sum of the frame bytes, so both arms must deliver the same data.
 */

import { parseArgs } from "node:util";
import { median } from "@mark1russell7/rigor-statistics";
import { createEventBus } from "../src/events/bus.js";
import { EventPublisher } from "../src/events/publisher.js";
import type { EventItem } from "../src/events/remote.js";
import { invokeProcedure } from "../src/procedures/invoke.js";
import { SLICE_SIZE, parseCase } from "./fan-out-cases.js";

const WARM_PUBLISHES = 2;
const TIMED_PUBLISHES = 5;
const TOPIC = "orders.created";
const PAYLOAD = { id: "order-1", tenant: "t-1", version: 7, changed: ["status", "total"] };

const { values } = parseArgs({ options: { arm: { type: "string" }, case: { type: "string" } } });
if ((values.arm !== "plain" && values.arm !== "sliced") || values.case === undefined) throw new RangeError("this child needs --arm plain|sliced and --case <id>");
const { measure, subscribers } = parseCase(values.case);

const bus = createEventBus(values.arm === "sliced" ? { fanOut: { sliceSize: SLICE_SIZE } } : {});
const publisher = new EventPublisher({ bus, topics: ["*"], buffer: 8 });

let frames = 0;
let bytes = 0;
let allFrames: (() => void) | undefined;

/** One subscriber: it reads its stream, and makes the frame of each item. */
async function read(items: AsyncGenerator<EventItem, void, undefined>): Promise<void> {
  for await (const item of items) {
    bytes += JSON.stringify(item).length;
    if (++frames === subscribers) allFrames?.();
  }
}

const controller = new AbortController();
for (let i = 0; i < subscribers; i++) {
  const output = await invokeProcedure(publisher.procedure, { topics: [TOPIC] }, { signal: controller.signal });
  if (output.kind !== "stream") throw new Error("events.subscribe gives a stream");
  const items = output.items as AsyncGenerator<EventItem, void, undefined>;
  await items.next();
  void read(items);
}

const nextTask = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** One publish. The probe is a chain of tasks, so a gap in the chain is a block of the event loop. */
async function publish(): Promise<{ block: number; total: number }> {
  frames = 0;
  await nextTask();
  const delivered = new Promise<void>((resolve) => (allFrames = resolve));
  let longest = 0;
  let probing = true;
  const start = performance.now();
  let last = start;
  const probe = (): void => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
    if (probing) setImmediate(probe);
  };
  setImmediate(probe);
  publisher.publish(TOPIC, PAYLOAD);
  await delivered;
  const total = performance.now() - start;
  // The microtasks of the last slice end before the next task: the probe sees them
  await nextTask();
  await nextTask();
  probing = false;
  return { block: longest, total };
}

for (let i = 0; i < WARM_PUBLISHES; i++) await publish();
bytes = 0;

const blocks: number[] = [];
const totals: number[] = [];
for (let i = 0; i < TIMED_PUBLISHES; i++) {
  const { block, total } = await publish();
  blocks.push(block);
  totals.push(total);
}

const ms = measure === "block" ? Math.max(...blocks) : median(totals);
console.log(JSON.stringify({ ms, hash: String(bytes) }));
process.exit(0);
