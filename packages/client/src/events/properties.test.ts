/**
 * Property tests of the remote events (`documentation/EVENTS.md`): the order and the delivery at
 * most once of a subscription, for each mix of events and reads that fast-check makes.
 *
 * The test reads the stream of `events.subscribe` as a host does, through `invokeProcedure`, so
 * the output validation runs. It reads only when the queue has an event or when no event waits,
 * so the run never hangs. The properties:
 *
 * - The events of the subscription arrive in the order of `emit()`, and only its topics.
 * - Each event arrives at most once: `seq` grows, and the event with number `seq` is the emitted
 *   event with that number.
 * - The gap before each event is its `dropped` count, and the newest event never goes.
 * - After the end, no listener stays on the bus.
 *
 * `FC_RUNS` sets the number of runs (default 200).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { invokeProcedure } from "../procedures/invoke.js";
import { createEventBus } from "./bus.js";
import { EventPublisher } from "./publisher.js";
import type { EventItem } from "./remote.js";

const RUNS = Number(process.env["FC_RUNS"] ?? 200);
const TOPICS = ["a", "b", "c"] as const;

type Step = { kind: "emit"; topic: (typeof TOPICS)[number] } | { kind: "read" };

const step: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant("emit" as const), topic: fc.constantFrom(...TOPICS) }),
  fc.constant({ kind: "read" as const }),
);

type Event = Extract<EventItem, { type: "event" }>;

describe("the delivery of a subscription (EVENTS.md)", () => {
  it("keeps the order of emit, gives each event at most once, and counts each loss", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.subarray([...TOPICS], { minLength: 1 }),
        fc.integer({ min: 1, max: 6 }),
        fc.array(step, { maxLength: 80 }),
        async (topics, buffer, steps) => {
          const bus = createEventBus();
          const publisher = new EventPublisher({ bus, topics: ["*"], buffer });
          const controller = new AbortController();
          const output = await invokeProcedure(publisher.procedure, { topics }, { signal: controller.signal });
          if (output.kind !== "stream") throw new Error("events.subscribe gives a stream");
          const items = output.items as AsyncGenerator<EventItem, void, undefined>;
          expect((await items.next()).value).toEqual({ type: "subscribed", topics });

          /** The events of the topics of the subscription, in the order of emit: number n is at n - 1. */
          const emitted: Array<{ topic: string; data: number }> = [];
          const delivered: Event[] = [];
          // The model of the queue: its length only. A read waits only when the queue is empty.
          let queued = 0;
          let waiting: Promise<IteratorResult<EventItem>> | undefined;
          let counter = 0;

          const take = (result: IteratorResult<EventItem>): void => {
            expect(result.done).toBe(false);
            delivered.push(result.value as Event);
          };
          for (const next of steps) {
            if (next.kind === "emit") {
              const data = ++counter;
              bus.emit(next.topic, data);
              if (!topics.includes(next.topic)) continue;
              emitted.push({ topic: next.topic, data });
              if (waiting) {
                take(await waiting);
                waiting = undefined;
              } else {
                queued = Math.min(buffer, queued + 1);
              }
            } else if (!waiting) {
              if (queued > 0) {
                queued--;
                take(await items.next());
              } else {
                waiting = items.next();
              }
            }
          }
          // Drain the queue
          while (queued > 0) {
            queued--;
            take(await items.next());
          }

          let previous = 0;
          for (const event of delivered) {
            expect(event.type).toBe("event");
            expect(event.seq).toBeGreaterThan(previous);
            expect({ topic: event.topic, data: event.data }).toEqual(emitted[event.seq - 1]);
            expect(event.dropped ?? 0).toBe(event.seq - previous - 1);
            previous = event.seq;
          }
          // The newest event of the subscription never goes: a drop takes the oldest
          if (emitted.length > 0 && !waiting) expect(delivered.at(-1)?.seq).toBe(emitted.length);
          expect(delivered.length + delivered.reduce((sum, event) => sum + (event.dropped ?? 0), 0)).toBe(previous);

          // The end of the subscription removes its listeners
          controller.abort();
          await waiting?.catch(() => undefined);
          await items.return?.(undefined);
          expect(bus.channels()).toEqual([]);
          expect(publisher.subscriptions).toBe(0);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
