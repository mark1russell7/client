/**
 * mark asks for a missing required argument in a terminal (CLIMeta.interactive and prompts.ts
 * were not used before). It does not ask with --no-input, with CI set, outside a terminal, or
 * for a procedure that sets interactive: false.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { Client, LocalTransport, ProcedureRegistry, type AnyProcedure } from "@mark1russell7/client";
import { executeArgs, type CliContext } from "./cli.js";
import type { Asker, Terminal } from "./ask.js";
import { testProcedures } from "../test/procedures.js";

/** A context whose procedures record the input they get */
function context(): { ctx: CliContext; inputs: unknown[] } {
  const inputs: unknown[] = [];
  const registry = new ProcedureRegistry();
  const procedures = testProcedures().map((procedure) => {
    const recording = {
      ...procedure,
      handler: async (input: unknown) => {
        inputs.push(input);
        return input;
      },
    } as AnyProcedure;
    registry.register(recording);
    return recording;
  });
  return { ctx: { client: new Client({ transport: new LocalTransport({ registry }) }), procedures, verbose: false }, inputs };
}

const terminal: Terminal = { stdinIsTTY: true, stdoutIsTTY: true, env: {} };

/** An asker that answers from a list, and records the questions */
function answers(...values: unknown[]): { ask: Asker; questions: string[] } {
  const questions: string[] = [];
  const ask: Asker = async (_field, message) => {
    questions.push(message);
    return { value: values.shift() };
  };
  return { ask, questions };
}

afterEach(() => {
  process.exitCode = 0;
  vi.restoreAllMocks();
});

describe("questions for missing arguments", () => {
  it("asks for a missing required argument in a terminal, and runs with the answer", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx, inputs } = context();
    const { ask, questions } = answers("README.md");
    await executeArgs(["fs", "exists", "--local"], ctx, { terminal, ask });
    expect(questions).toEqual(["path (string)"]);
    expect(inputs).toEqual([{ path: "README.md" }]);
    expect(process.exitCode ?? 0).toBe(0);
  });

  it("converts each answer by the type of its field: an array takes the words", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { ctx, inputs } = context();
    const { ask } = answers("box", "sh -c ls");
    await executeArgs(["docker", "exec", "--local"], ctx, { terminal, ask });
    expect(inputs).toEqual([{ container: "box", command: ["sh", "-c", "ls"] }]);
  });

  it("does not ask with --no-input, with CI set, or outside a terminal: the input is invalid", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    for (const [argv, term] of [
      [["--no-input", "fs", "exists", "--local"], terminal],
      [["fs", "exists", "--local"], { ...terminal, env: { CI: "true" } }],
      [["fs", "exists", "--local"], { ...terminal, stdinIsTTY: false }],
    ] as const) {
      process.exitCode = 0;
      const { ctx, inputs } = context();
      const { ask, questions } = answers("x");
      await executeArgs([...argv], ctx, { terminal: term, ask });
      expect(questions).toEqual([]);
      expect(inputs).toEqual([]);
      expect(process.exitCode).toBe(1);
    }
  });

  it("stops with exit code 1 when the person cancels", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ctx, inputs } = context();
    await executeArgs(["fs", "exists", "--local"], ctx, { terminal, ask: async () => ({ cancelled: true }) });
    expect(inputs).toEqual([]);
    expect(process.exitCode).toBe(1);
  });
});
