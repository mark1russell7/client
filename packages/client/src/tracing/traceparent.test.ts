/**
 * The trace ids and span ids of the W3C trace context: their form, and the pool of random bytes
 * that they come from (roadmap O94).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { RANDOM_POOL_BYTES, formatTraceparent, isW3cIds, newSpanId, newTraceId, parseTraceparent } from "./traceparent.js";

afterEach(() => {
  vi.restoreAllMocks();
});

/** This function imports a new copy of the module: its pool of random bytes is empty. */
async function freshIds(): Promise<typeof import("./traceparent.js")> {
  vi.resetModules();
  return import("./traceparent.js");
}

describe("the trace ids and span ids", () => {
  it("have 32 and 16 lowercase hex digits, and are not all zeros", () => {
    for (let index = 0; index < 1000; index++) {
      const traceId = newTraceId();
      const spanId = newSpanId();
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(isW3cIds(traceId, spanId)).toBe(true);
    }
  });

  it("make a traceparent that parses back to the same ids", () => {
    const traceId = newTraceId();
    const spanId = newSpanId();
    expect(parseTraceparent(formatTraceparent(traceId, spanId))).toEqual({ traceId, spanId, sampled: true });
  });

  it("do not repeat over more ids than one pool holds", () => {
    const count = (RANDOM_POOL_BYTES / 8) * 3;
    const ids = new Set(Array.from({ length: count }, () => newSpanId()));
    expect(ids.size).toBe(count);
  });

  it("use each byte of the pool for one id only, in order, and fill the pool again when it is used up", async () => {
    // A fake source gives the bytes 0, 1, 2, ... so the digits show which bytes each id used
    let counter = 0;
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      const bytes = array as unknown as Uint8Array;
      for (let index = 0; index < bytes.length; index++) bytes[index] = counter++ % 256;
      return array;
    });
    const ids = await freshIds();
    expect(ids.newSpanId()).toBe("0001020304050607");
    expect(ids.newTraceId()).toBe("08090a0b0c0d0e0f1011121314151617");
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0]![0] as Uint8Array).length).toBe(RANDOM_POOL_BYTES);
    // 24 bytes are used: the pool holds (4096 - 24) / 8 = 509 more span ids
    for (let index = 0; index < (RANDOM_POOL_BYTES - 24) / 8; index++) ids.newSpanId();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(ids.newSpanId()).toBe("0001020304050607");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("fill the pool again before an id that does not fit in the rest of the pool", async () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    const ids = await freshIds();
    // 511 span ids leave 8 bytes: a trace id needs 16
    for (let index = 0; index < RANDOM_POOL_BYTES / 8 - 1; index++) ids.newSpanId();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(ids.newTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("use Math.random when the platform has no getRandomValues", () => {
    const crypto = globalThis.crypto;
    vi.stubGlobal("crypto", undefined);
    const random = vi.spyOn(Math, "random");
    try {
      for (let index = 0; index <= RANDOM_POOL_BYTES / 8; index++) expect(newSpanId()).toMatch(/^[0-9a-f]{16}$/);
      expect(random).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      expect(globalThis.crypto).toBe(crypto);
    }
  });
});
