/**
 * core.catch catches a failure of the hydration of its `try` input (deep dive DATA-22).
 * Before, the hydration ran outside the `try`, and a nested ref that threw escaped core.catch.
 */

import { describe, expect, it } from "vitest";
import type { ProcedureContext } from "@mark1russell7/client";
import { coreCatch } from "./catch.js";
import type { CoreCatchInput } from "../../types.js";

/** A context whose client runs "ok" and "decide", and throws for "boom". */
function context(): ProcedureContext {
  const call = async (path: string[], input: unknown) => {
    const key = path.join(".");
    if (key === "boom") throw new Error("boom failed");
    if (key === "ok") return { ran: true, input };
    if (key === "decide") return { continue: true, input };
    throw new Error(`Unexpected procedure call: ${key}`);
  };
  return { client: { call } } as unknown as ProcedureContext;
}

describe("core.catch", () => {
  it("returns the result of the try step", async () => {
    const result = await coreCatch({ try: { $proc: ["ok"], input: { a: 1 }, $when: "catch" } } as CoreCatchInput, context());
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ ran: true, input: { a: 1 } });
  });

  it("catches a nested ref of the try input that throws", async () => {
    const input = {
      try: { $proc: ["ok"], input: { value: { $proc: ["boom"], input: {} } }, $when: "catch" },
    } as CoreCatchInput;
    const result = await coreCatch(input, context());
    expect(result).toMatchObject({ success: false, error: "boom failed", continue: false });
  });

  it("gives the failure to the handler", async () => {
    const input = {
      try: { $proc: ["ok"], input: { value: { $proc: ["boom"], input: {} } }, $when: "catch" },
      handler: { $proc: ["decide"], input: {}, $when: "catch" },
    } as CoreCatchInput;
    const result = await coreCatch(input, context());
    expect(result.success).toBe(false);
    expect(result.continue).toBe(true);
  });

  it("reports a handler whose input fails to hydrate", async () => {
    const input = {
      try: { $proc: ["boom"], input: {}, $when: "catch" },
      handler: { $proc: ["decide"], input: { value: { $proc: ["boom"], input: {} } }, $when: "catch" },
    } as CoreCatchInput;
    const result = await coreCatch(input, context());
    expect(result).toMatchObject({ success: false, continue: false });
    expect(result.error).toMatch(/^Handler failed: boom failed/);
  });
});
