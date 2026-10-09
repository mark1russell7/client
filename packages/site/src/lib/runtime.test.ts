/**
 * The trace knows the consumer of each call that hydration ran, so a nested call shows under the
 * call that gets its result, as in the blocks (the trace consumer edge of the deep dive).
 */

import { describe, it, expect } from "vitest";
import { linkConsumers, runProgram, type TraceCall } from "./runtime";
import type { Json } from "./program";

const call = (name: string, input: Json): Json => ({ $proc: ["client", name], input });

/** The consumer of the first call with the key, as the key of the consumer call. */
function consumerKey(calls: TraceCall[], key: string): string | undefined {
  const found = calls.find((candidate) => candidate.key === key);
  const consumer = calls.find((candidate) => candidate.id === found?.consumer);
  return consumer?.key;
}

describe("the consumer of a call", () => {
  it("is the call whose input held it, at every depth of the root input", async () => {
    const result = await runProgram(call("identity", { value: call("add", { a: call("multiply", { a: 2, b: 3 }), b: 1 }) }));
    expect(result.ok).toBe(true);
    expect(result.value).toBe(7);
    expect(consumerKey(result.calls, "client.multiply")).toBe("client.add");
    expect(consumerKey(result.calls, "client.add")).toBe("client.identity");
    expect(consumerKey(result.calls, "client.identity")).toBeUndefined();
  });

  it("is the operand call of control flow", async () => {
    const result = await runProgram(
      call("conditional", { condition: true, then: call("add", { a: call("multiply", { a: 2, b: 3 }), b: 1 }), else: 0 }),
    );
    expect(result.value).toBe(7);
    expect(consumerKey(result.calls, "client.multiply")).toBe("client.add");
    // add is the operand of conditional: conditional started it, so it has no consumer
    expect(consumerKey(result.calls, "client.add")).toBeUndefined();
  });

  it("is not set for the steps of a chain", async () => {
    const result = await runProgram(
      call("chain", { steps: [call("add", { a: 1, b: 2 }), call("multiply", { a: { $ref: "$last" }, b: 10 })] }),
    );
    expect(result.value).toEqual({ results: [3, 30], final: 30 });
    expect(result.calls.every((candidate) => candidate.consumer === undefined)).toBe(true);
  });
});

describe("linkConsumers", () => {
  const traceCall = (id: number, parent: number | null, key: string): TraceCall => ({ id, parent, key, input: null, start: id, end: id + 0.5 });

  it("gives a call at the top of a hydrated value the next call of its caller that hydration did not run", () => {
    const calls = [traceCall(1, null, "a"), traceCall(2, null, "b"), traceCall(3, null, "root")];
    const top = {};
    linkConsumers(calls, new Map([[top, 9]]), new Map<number, object | null>([[1, null], [2, null]]));
    expect(calls.map((candidate) => candidate.consumer)).toEqual([3, 3, undefined]);
  });

  it("uses the call of the consumer ref when the trace has it", () => {
    const calls = [traceCall(1, null, "multiply"), traceCall(2, null, "add"), traceCall(3, null, "root")];
    const addRef = {};
    linkConsumers(calls, new Map([[addRef, 2]]), new Map<number, object | null>([[1, addRef], [2, null]]));
    expect(calls.map((candidate) => candidate.consumer)).toEqual([2, 3, undefined]);
  });
});
