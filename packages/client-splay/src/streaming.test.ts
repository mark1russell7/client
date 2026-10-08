import { describe, it, expect } from "vitest";
import type { ComponentOutput } from "@mark1russell7/client/components";
import { debounceStream, mergeStreams } from "./streaming.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function output(id: string): ComponentOutput {
  return { id } as unknown as ComponentOutput;
}

async function* timed(items: Array<[id: string, delayMs: number]>): AsyncIterable<ComponentOutput> {
  for (const [id, delayMs] of items) {
    await sleep(delayMs);
    yield output(id);
  }
}

async function collect(stream: AsyncIterable<ComponentOutput>): Promise<string[]> {
  const ids: string[] = [];
  for await (const item of stream) {
    ids.push((item as unknown as { id: string }).id);
  }
  return ids;
}

describe("mergeStreams", () => {
  it("yields every item of every stream", async () => {
    const merged = mergeStreams(
      timed([["a1", 5], ["a2", 5], ["a3", 5]]),
      timed([["b1", 7], ["b2", 7]]),
      timed([["c1", 1]])
    );

    const ids = await collect(merged);

    expect(ids.sort()).toEqual(["a1", "a2", "a3", "b1", "b2", "c1"]);
  });
});

describe("debounceStream (regression: BUGS-2026-07 H29)", () => {
  it("ends with the stream and emits the last output of a burst", async () => {
    const debounced = debounceStream(timed([["x1", 0], ["x2", 1], ["x3", 1]]), 50);

    const ids = await Promise.race([collect(debounced), sleep(2000).then(() => ["TIMEOUT"])]);

    expect(ids).toEqual(["x3"]);
  });

  it("emits one output per burst when bursts are separated by a quiet period", async () => {
    const debounced = debounceStream(timed([["a", 0], ["b", 1], ["c", 120], ["d", 1]]), 40);

    const ids = await Promise.race([collect(debounced), sleep(2000).then(() => ["TIMEOUT"])]);

    expect(ids).toEqual(["b", "d"]);
  });

  it("ends for an empty stream", async () => {
    const debounced = debounceStream(timed([]), 20);

    const ids = await Promise.race([collect(debounced), sleep(1000).then(() => ["TIMEOUT"])]);

    expect(ids).toEqual([]);
  });
});
