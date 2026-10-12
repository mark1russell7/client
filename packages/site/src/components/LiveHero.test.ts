import { describe, it, expect } from "vitest";
import { compactJson, replayEvents } from "./LiveHero";
import type { TraceCall } from "../lib/runtime";

describe("the live panel of the home page", () => {
  it("prints a part that fits on one line, and breaks a part that does not fit", () => {
    expect(compactJson({ a: 1, b: [1, 2] })).toBe('{ "a": 1, "b": [1, 2] }');
    const text = compactJson({ steps: [{ name: "a".repeat(30) }, { name: "b".repeat(30) }] }, 40);
    expect(text.split("\n").length).toBeGreaterThan(1);
    expect(JSON.parse(text)).toEqual({ steps: [{ name: "a".repeat(30) }, { name: "b".repeat(30) }] });
  });

  it("replays the calls in time order, and a call never ends before it starts", () => {
    const calls: TraceCall[] = [
      { id: 1, parent: null, key: "client.chain", input: null, start: 0, end: 5 },
      { id: 2, parent: 1, key: "client.add", input: null, start: 1, end: 1 },
      { id: 3, parent: 1, key: "client.multiply", input: null, start: 1, end: 2 },
    ];
    expect(replayEvents(calls)).toEqual([
      { id: 1, kind: "start" },
      { id: 2, kind: "start" },
      { id: 3, kind: "start" },
      { id: 2, kind: "end" },
      { id: 3, kind: "end" },
      { id: 1, kind: "end" },
    ]);
  });

  it("ends the inner call first when two calls end at the same time", () => {
    const calls: TraceCall[] = [
      { id: 1, parent: null, key: "client.chain", input: null, start: 0, end: 3 },
      { id: 2, parent: 1, key: "client.add", input: null, start: 1, end: 3 },
    ];
    const ends = replayEvents(calls).filter((event) => event.kind === "end").map((event) => event.id);
    expect(ends).toEqual([2, 1]);
  });
});
