/**
 * Benchmarks of the core (roadmap R32): the paths that each call takes. The nightly workflow
 * runs them with `vitest bench`. Each benchmark writes its result to `bench/results/`, and
 * `scripts/bench-compare.mjs` compares the results with the results of the last nightly run on
 * the same kind of runner.
 *
 * Vitest 5 gives the benchmarks as the `bench` fixture of a test.
 */

import { test } from "vitest";
import { Client } from "../src/client/client.js";
import { LocalTransport } from "../src/adapters/local/client/transport.js";
import { allCoreProcedures } from "../src/procedures/core/index.js";
import { ProcedureRegistry } from "../src/procedures/registry.js";
import { createRefScope, hydrateInput } from "../src/procedures/ref.js";
import { narrowCapability } from "../src/procedures/capability.js";

const registry = new ProcedureRegistry();
for (const procedure of allCoreProcedures) registry.register(procedure);
const client = new Client(new LocalTransport({ registry })).useRegistry(registry);

const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });
/** A program with 50 steps: each step adds 1 to the result before it. */
const chain = {
  $proc: ["client", "chain"],
  input: { steps: [add(0, 1), ...Array.from({ length: 49 }, () => add({ $ref: "$last" }, 1))] },
};
/** A map over 100 items. */
const map = {
  $proc: ["client", "map"],
  input: { items: Array.from({ length: 100 }, (_, index) => index), fn: add({ $ref: "item" }, 1) },
};
/** Plain data with 200 refs to resolve. */
const scope = createRefScope();
scope.outputs.set("a", { b: { c: 1 } });
const data = { list: Array.from({ length: 200 }, () => ({ value: { $ref: "a.b.c" }, other: [1, 2, 3] })) };

/** The file of the result of one benchmark. */
const result = (name: string) => ({ writeResult: `bench/results/${name}.json` });

test("the core", async ({ bench }) => {
  await bench.compare(
    bench("exec-one-call", result("exec-one-call"), async () => {
      await client.exec(add(1, 2));
    }),
    bench("exec-chain-50", result("exec-chain-50"), async () => {
      await client.exec(chain);
    }),
    bench("exec-map-100", result("exec-map-100"), async () => {
      await client.exec(map);
    }),
    bench("hydrate-200-refs", result("hydrate-200-refs"), async () => {
      await hydrateInput(data, async () => undefined as never, { scope });
    }),
    bench("narrow-capability", result("narrow-capability"), () => {
      narrowCapability({ effects: { reads: ["fs", "network"], writes: ["fs"] }, deadline: 10_000 }, { effects: { writes: [] }, timeoutMs: 500 }, undefined, 0);
    }),
  );
});
