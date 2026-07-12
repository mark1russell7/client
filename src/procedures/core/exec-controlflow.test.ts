/**
 * End-to-end tests for control-flow procedures driven through `client.exec()`.
 *
 * Unlike the per-handler unit tests (chain/conditional/parallel/tryCatch.test.ts),
 * these exercise the FULL pipeline: exec() -> hydration decision -> execInternal ->
 * handler -> ctx.client.call. They are the regression guard for:
 *   - C2  exec of an explicit client.chain no longer crashes ("steps is not iterable")
 *   - H2  conditional runs ONLY the selected branch (no eager both-branch side effects)
 *   - H3  tryCatch actually catches a throwing try ref
 *   - M35 parallel executes task refs and reports per-task errors
 *
 * See documentation/BUGS-2026-07.md.
 */

import { describe, it, expect } from "vitest";
import { Client } from "../../client/client.js";
import { defineProcedure } from "../define.js";
import { outputSchema } from "./schemas.js";
import { ProcedureRegistry } from "../registry.js";
import { coreProcedures } from "./index.js";

// exec() resolves procedures from the registry and never touches the transport here.
const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];

/**
 * Build a client whose registry contains the core control-flow procedures plus a set
 * of side-effect "recorder" procedures. `calls` records the order procedures ran in.
 */
function makeSetup(): { client: Client; calls: string[] } {
  const calls: string[] = [];
  const reg = new ProcedureRegistry();

  // Register the real control-flow procedures (paths: ["client", "chain"], etc.)
  for (const p of coreProcedures) {
    reg.register(p);
  }

  const recorder = (name: string) =>
    defineProcedure({
      path: ["test", name],
      input: outputSchema<Record<string, unknown>>(),
      output: outputSchema<{ ran: string }>(),
      handler: () => {
        calls.push(name);
        return { ran: name };
      },
    });

  for (const name of ["a", "b", "c", "then", "else", "fallback"]) {
    reg.register(recorder(name));
  }

  // A predicate that records and returns a falsy { value } result.
  reg.register(
    defineProcedure({
      path: ["test", "isFalse"],
      input: outputSchema<Record<string, unknown>>(),
      output: outputSchema<{ value: boolean }>(),
      handler: () => {
        calls.push("isFalse");
        return { value: false };
      },
    })
  );

  // A procedure that records and then throws.
  reg.register(
    defineProcedure({
      path: ["test", "boom"],
      input: outputSchema<Record<string, unknown>>(),
      output: outputSchema<{ ran: string }>(),
      handler: () => {
        calls.push("boom");
        throw new Error("boom!");
      },
    })
  );

  const client = new Client(stubTransport).useRegistry(reg);
  return { client, calls };
}

describe("control-flow via client.exec (regression: BUGS-2026-07 C2/H2/H3/M35)", () => {
  describe("chain (C2)", () => {
    it("execs an explicit client.chain without crashing and runs steps in order", async () => {
      const { client, calls } = makeSetup();

      const result = await client.exec<{ results: unknown[]; final: unknown }>({
        $proc: ["client", "chain"],
        input: {
          steps: [
            { $proc: ["test", "a"], input: {} },
            { $proc: ["test", "b"], input: {} },
            { $proc: ["test", "c"], input: {} },
          ],
        },
      });

      expect(calls).toEqual(["a", "b", "c"]);
      expect(result.results).toEqual([{ ran: "a" }, { ran: "b" }, { ran: "c" }]);
      expect(result.final).toEqual({ ran: "c" });
    });
  });

  describe("conditional (H2)", () => {
    it("runs ONLY the selected branch; the other branch side effect does not run", async () => {
      const { client, calls } = makeSetup();

      const result = await client.exec({
        $proc: ["client", "conditional"],
        input: {
          condition: false,
          then: { $proc: ["test", "then"], input: {} },
          else: { $proc: ["test", "else"], input: {} },
        },
      });

      expect(result).toEqual({ ran: "else" });
      expect(calls).toEqual(["else"]);
      expect(calls).not.toContain("then");
    });

    it("executes a procedure-ref condition before choosing the branch", async () => {
      const { client, calls } = makeSetup();

      const result = await client.exec({
        $proc: ["client", "conditional"],
        input: {
          condition: { $proc: ["test", "isFalse"], input: {} },
          then: { $proc: ["test", "then"], input: {} },
          else: { $proc: ["test", "else"], input: {} },
        },
      });

      expect(result).toEqual({ ran: "else" });
      // Condition ran first, then only the else branch.
      expect(calls).toEqual(["isFalse", "else"]);
    });
  });

  describe("tryCatch (H3)", () => {
    it("catches a throwing try ref and runs the catch ref", async () => {
      const { client, calls } = makeSetup();

      const result = await client.exec<{ success: boolean; value: unknown; error?: string }>({
        $proc: ["client", "tryCatch"],
        input: {
          try: { $proc: ["test", "boom"], input: {} },
          catch: { $proc: ["test", "fallback"], input: {} },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("boom!");
      expect(result.value).toEqual({ ran: "fallback" });
      expect(calls).toEqual(["boom", "fallback"]);
    });

    it("returns the try result on success and does not run catch", async () => {
      const { client, calls } = makeSetup();

      const result = await client.exec<{ success: boolean; value: unknown }>({
        $proc: ["client", "tryCatch"],
        input: {
          try: { $proc: ["test", "a"], input: {} },
          catch: { $proc: ["test", "fallback"], input: {} },
        },
      });

      expect(result.success).toBe(true);
      expect(result.value).toEqual({ ran: "a" });
      expect(calls).toEqual(["a"]);
      expect(calls).not.toContain("fallback");
    });
  });

  describe("parallel (M35)", () => {
    it("runs all task refs and reports success", async () => {
      const { client, calls } = makeSetup();

      const result = await client.exec<{
        results: unknown[];
        allSucceeded: boolean;
        errors: Array<{ index: number; error: string }>;
      }>({
        $proc: ["client", "parallel"],
        input: {
          tasks: [
            { $proc: ["test", "a"], input: {} },
            { $proc: ["test", "b"], input: {} },
            { $proc: ["test", "c"], input: {} },
          ],
        },
      });

      expect([...calls].sort()).toEqual(["a", "b", "c"]);
      expect(result.results).toEqual([{ ran: "a" }, { ran: "b" }, { ran: "c" }]);
      expect(result.allSucceeded).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("collects per-task errors without failing the whole run", async () => {
      const { client } = makeSetup();

      const result = await client.exec<{
        results: unknown[];
        allSucceeded: boolean;
        errors: Array<{ index: number; error: string }>;
      }>({
        $proc: ["client", "parallel"],
        input: {
          tasks: [
            { $proc: ["test", "a"], input: {} },
            { $proc: ["test", "boom"], input: {} },
            { $proc: ["test", "c"], input: {} },
          ],
        },
      });

      expect(result.allSucceeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.index).toBe(1);
      expect(result.errors[0]!.error).toContain("boom!");
      expect(result.results[0]).toEqual({ ran: "a" });
      expect(result.results[2]).toEqual({ ran: "c" });
    });
  });
});
