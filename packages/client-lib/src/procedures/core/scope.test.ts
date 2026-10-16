/**
 * The runners of client-lib (core.catch, dag.traverse) see the names of the chain around them.
 *
 * A runner takes its input raw and hydrates its operands itself. Before, it hydrated them with no
 * scope, so a `$ref` to an outer step name stayed an object, and its input validation (Zod)
 * dropped the scope that the caller gave (open question 1 of the deep-dive wave 1).
 */

import { describe, expect, it } from "vitest";
import { Client, LocalTransport, PROCEDURE_REGISTRY, createRefScope, invokeProcedure, outputValue, withScope } from "@procedures/client";
// The chain of the core, and this package (an import registers nothing: P9)
import "@procedures/client/register";
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

  it("keeps the scope that the caller gives through the Zod validation of invokeProcedure", async () => {
    // The core keeps the scope across input validation (docs review DOC-10), so the runners use
    // their plain Zod schemas
    const scope = createRefScope();
    scope.outputs.set("outer", 7);
    const procedure = PROCEDURE_REGISTRY.get(["core", "catch"])!;
    const output = await invokeProcedure(
      procedure,
      withScope({ try: { $proc: ["client", "identity"], input: { value: { $ref: "outer" } }, $when: "catch" } }, scope),
      { registry: PROCEDURE_REGISTRY },
    );
    const result = (await outputValue(output)) as { success: boolean; result: unknown };
    expect(result).toMatchObject({ success: true, result: 7 });
  });
});
