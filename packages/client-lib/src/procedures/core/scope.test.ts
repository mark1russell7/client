/**
 * The runners of client-lib (core.catch, dag.traverse) see the names of the chain around them.
 *
 * A runner takes its input raw and hydrates its operands itself. Before, it hydrated them with no
 * scope, so a `$ref` to an outer step name stayed an object, and its input validation (Zod)
 * dropped the scope that the caller gave (open question 1 of the deep-dive wave 1).
 */

import { describe, expect, it } from "vitest";
import { Client, LocalTransport, PROCEDURE_REGISTRY, createRefScope, scopeOf, withScope } from "@mark1russell7/client";
import "../../register.js";

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

describe("runner scope", () => {
  it("core.catch reads a name of the chain around it", async () => {
    const result = await client.exec({
      $proc: ["client", "chain"],
      input: {
        steps: [
          { $proc: ["client", "identity"], input: { value: 42 }, $name: "answer" },
          {
            $proc: ["core", "catch"],
            input: {
              try: { $proc: ["client", "identity"], input: { value: { $ref: "answer" } }, $when: "catch" },
            },
          },
        ],
      },
    });
    expect((result as { final: { success: boolean; result: unknown } }).final).toMatchObject({ success: true, result: 42 });
  });

  it("core.catch reports a name that no scope has", async () => {
    const result = await client.exec({
      $proc: ["client", "chain"],
      input: {
        steps: [
          { $proc: ["client", "identity"], input: { value: 1 }, $name: "one" },
          {
            $proc: ["core", "catch"],
            input: {
              try: { $proc: ["client", "identity"], input: { value: { $ref: "missing" } }, $when: "catch" },
            },
          },
        ],
      },
    });
    const final = (result as { final: { success: boolean; error?: string } }).final;
    expect(final.success).toBe(false);
    expect(final.error).toMatch(/Unknown \$ref name "missing"/);
  });

  it("the input schemas of core.catch and dag.traverse keep the scope that the caller gives", () => {
    const scope = createRefScope();
    for (const [path, input] of [
      [["core", "catch"], { try: { $proc: ["client", "identity"], input: {} } }],
      [["dag", "traverse"], { visit: ["client", "identity"] }],
    ] as const) {
      const procedure = PROCEDURE_REGISTRY.get([...path]);
      const result = procedure!.input.safeParse(withScope({ ...input }, scope));
      expect(result.success).toBe(true);
      expect(scopeOf(result.success ? result.data : undefined)).toBe(scope);
    }
  });
});
