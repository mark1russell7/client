/**
 * The token check of the server (`tokenMatches`). The comparison reads each character of the
 * presented token one time, so its time depends only on what the caller sent.
 */

import { describe, expect, it } from "vitest";
import { ProcedureServer, tokenMatches } from "./procedure-server.js";
import { LOCAL_CREDENTIALS } from "./request-auth.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import { createRegistry, defineModule } from "../procedures/module.js";
import type { AnyProcedure } from "../procedures/types.js";

/** A stand-in for the expected token that counts the characters that the comparison reads. */
function counted(text: string): { expected: string; reads: () => number } {
  let reads = 0;
  const expected = {
    length: text.length,
    charCodeAt(index: number): number {
      reads += 1;
      return text.charCodeAt(index);
    },
  };
  return { expected: expected as unknown as string, reads: () => reads };
}

describe("tokenMatches", () => {
  it("accepts only the expected token", () => {
    expect(tokenMatches("s3cret-token", "s3cret-token")).toBe(true);
    expect(tokenMatches("s3cret-token", "s3cret-tokeN")).toBe(false);
    expect(tokenMatches("s3cret-token", undefined)).toBe(false);
  });

  it("refuses a token of another length, also a prefix and an extension of the expected one", () => {
    expect(tokenMatches("abc", "ab")).toBe(false);
    expect(tokenMatches("abc", "abcd")).toBe(false);
    expect(tokenMatches("abc", "")).toBe(false);
    expect(tokenMatches("abc", "abc\u0000")).toBe(false);
  });

  it("matches nothing with an empty expected token, for a presented token of any length", () => {
    expect(tokenMatches("", undefined)).toBe(false);
    // The modulo of the loop is NaN for an empty expected token, so these lengths pin that case
    for (const length of [0, 1, 2, 3, 8, 64, 512]) {
      expect(tokenMatches("", "x".repeat(length))).toBe(false);
      expect(tokenMatches("", "\u0000".repeat(length))).toBe(false);
    }
  });

  it("reads one expected character for each presented character, for each expected length", () => {
    const presented = "x".repeat(64);
    for (const length of [0, 1, 8, 64, 512]) {
      const stand = counted("s".repeat(length));
      expect(tokenMatches(stand.expected, presented)).toBe(false);
      expect(stand.reads()).toBe(presented.length);
    }
  });

  it("compares the characters beyond the first 8 bits", () => {
    expect(tokenMatches("töken-€", "töken-€")).toBe(true);
    expect(tokenMatches("töken-€", "töken-₭")).toBe(false);
  });
});

describe("a ProcedureServer with an empty token", () => {
  const hello = defineProcedure({
    path: ["t", "hello"],
    input: outputSchema<unknown>(),
    output: outputSchema<unknown>(),
    handler: () => "hello",
  });
  const server = new ProcedureServer({ registry: createRegistry(defineModule("token-test", [hello as AnyProcedure])), autoRegister: true, token: "" });
  const statusOf = async (credentials: unknown): Promise<{ type: string; code?: string }> => {
    const response = await server.handle({
      id: "1",
      method: { service: "t", operation: "hello" },
      payload: {},
      metadata: {},
      credentials,
    } as Parameters<ProcedureServer["handle"]>[0]);
    return response.status as { type: string; code?: string };
  };

  it("refuses each network request, also one with an empty bearer", async () => {
    for (const credentials of [{}, { bearer: "" }, { bearer: "x" }, undefined]) {
      expect(await statusOf(credentials)).toMatchObject({ type: "error", code: "UNAUTHORIZED" });
    }
  });

  it("still answers a local request", async () => {
    expect((await statusOf(LOCAL_CREDENTIALS)).type).toBe("success");
  });
});
