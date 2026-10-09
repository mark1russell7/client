import { describe, it, expect } from "vitest";
import type { ComponentOutput } from "@mark1russell7/client/components";
import { debounceStream, mergeStreams, throttleStream } from "./streaming.js";

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

/** A source that yields an item each `everyMs`, counts its items, and records its end. */
function counted(everyMs: number) {
  const state = { pulled: 0, ended: false };
  async function* source(): AsyncGenerator<ComponentOutput> {
    try {
      for (;;) {
        await sleep(everyMs);
        state.pulled++;
        yield output(`n${state.pulled}`);
      }
    } finally {
      state.ended = true;
    }
  }
  return { state, stream: source() };
}

/** A source that yields nothing until `release()`, then ends. */
function idle() {
  const state = { ended: false };
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  async function* source(): AsyncGenerator<ComponentOutput> {
    try {
      await released;
    } finally {
      state.ended = true;
    }
  }
  return { state, stream: source(), release };
}

describe("mergeStreams ends its sources (deep dive DATA-12)", () => {
  it("returns every source when the reader stops early", async () => {
    const busy = counted(1);
    const quiet = idle();

    for await (const item of mergeStreams(busy.stream, quiet.stream)) {
      if ((item as unknown as { id: string }).id === "n3") break;
    }
    await sleep(20);

    expect(busy.state.ended).toBe(true);
    const pulled = busy.state.pulled;
    await sleep(20);
    expect(busy.state.pulled).toBe(pulled);

    // The idle source ends when its pending item settles
    quiet.release();
    await sleep(5);
    expect(quiet.state.ended).toBe(true);
  });

  it("rejects with the error of a source and returns the other sources", async () => {
    const busy = counted(2);
    async function* failing(): AsyncGenerator<ComponentOutput> {
      await sleep(5);
      throw new Error("source failed");
    }

    await expect(collect(mergeStreams(busy.stream, failing()))).rejects.toThrow("source failed");
    await sleep(10);
    expect(busy.state.ended).toBe(true);
  });

  it("yields many items of one source while another source is idle", async () => {
    const quiet = idle();
    async function* many(): AsyncGenerator<ComponentOutput> {
      for (let i = 0; i < 20000; i++) yield output(`m${i}`);
      quiet.release();
    }

    const ids = await collect(mergeStreams(many(), quiet.stream));

    expect(ids).toHaveLength(20000);
  });
});

describe("debounceStream stops with its reader (deep dive DATA-12)", () => {
  it("does not read the source after the reader stops", async () => {
    // Items each 30 ms, wait 10 ms: each item is emitted
    const source = counted(30);

    for await (const _ of debounceStream(source.stream, 10)) {
      break;
    }
    const pulled = source.state.pulled;
    await sleep(120);

    expect(source.state.pulled).toBeLessThanOrEqual(pulled + 1);
    expect(source.state.ended).toBe(true);
  });
});

describe("throttleStream emits the trailing item (deep dive DATA-12)", () => {
  it("emits the last item of an interval before the source ends", async () => {
    const quiet = idle();
    async function* burst(): AsyncGenerator<ComponentOutput> {
      yield output("a");
      yield output("b");
      yield output("c");
      // Then nothing for a long time
      await sleep(400);
      quiet.release();
    }

    const throttled = throttleStream(burst(), 30)[Symbol.asyncIterator]();
    const first = await throttled.next();
    const started = Date.now();
    const second = await Promise.race([throttled.next(), sleep(250).then(() => "TIMEOUT" as const)]);

    expect((first.value as unknown as { id: string }).id).toBe("a");
    expect(second).not.toBe("TIMEOUT");
    expect(((second as IteratorResult<ComponentOutput>).value as unknown as { id: string }).id).toBe("c");
    expect(Date.now() - started).toBeLessThan(250);
    await throttled.return?.();
  });

  it("emits the first and the last item of a burst, and the last item at the end", async () => {
    // Two bursts with no waits inside them. The trailing timer of the first burst (40 ms) fires
    // before the pause (80 ms) ends, so "c" goes out. Whether "d" goes out at once depends on
    // the machine load (it does when it comes 40 ms or more after "c"), so the test does not
    // examine it.
    async function* bursts(): AsyncGenerator<ComponentOutput> {
      yield output("a");
      yield output("b");
      yield output("c");
      await sleep(80);
      yield output("d");
      yield output("e");
    }

    const ids = await collect(throttleStream(bursts(), 40));

    expect(ids.slice(0, 2)).toEqual(["a", "c"]);
    expect(ids[ids.length - 1]).toBe("e");
    expect(ids).not.toContain("b");
  });
});
