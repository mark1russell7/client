// The procedures of the lifecycle test (`lifecycle.e2e.test.ts`), as a package of the old kind:
// importing this file registers them in the global registry. `procedure-server --procedures` with
// the URL of this file loads them.
// - `lifecycle.ticks` gives one item each 50 ms until the signal of its call aborts. It is a stream
//   without an end: only the cooperative abort of the drain ends it. It reads nothing and writes
//   nothing, so a call of it is repeatable.
// - `lifecycle.ticksOnce` is the same stream, but it declares a write. Thus a call of it can have
//   had its effect, and the host runs it one time (the operation `once`).
// - `lifecycle.count` gives `count` items, one each `every` ms, and then it ends. It is a stream
//   that ends within the grace of the drain.
import { PROCEDURE_REGISTRY, createProcedure, outputSchema } from "@procedures/client";

const NO_EFFECTS = { reads: [], writes: [] };
const A_WRITE = { reads: [], writes: ["lifecycle"] };

/** This function waits for a time, or until the signal aborts. */
function pause(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** One item each 50 ms, until the signal of the call aborts. */
async function* ticks(_input, ctx) {
  let tick = 0;
  while (!ctx.signal?.aborted) {
    yield ++tick;
    await pause(50, ctx.signal);
  }
}

const ticksProcedure = createProcedure()
  .path(["lifecycle", "ticks"])
  .input(outputSchema())
  .output(outputSchema())
  .meta({ description: "One item each 50 ms, until the abort of the call", effects: NO_EFFECTS })
  .handler(ticks)
  .build();

const ticksOnceProcedure = createProcedure()
  .path(["lifecycle", "ticksOnce"])
  .input(outputSchema())
  .output(outputSchema())
  .meta({ description: "One item each 50 ms, until the abort of the call. It declares a write", effects: A_WRITE })
  .handler(ticks)
  .build();

const countProcedure = createProcedure()
  .path(["lifecycle", "count"])
  .input(outputSchema())
  .output(outputSchema())
  .meta({ description: "The items 1 to count, one each `every` ms, and then the end", effects: NO_EFFECTS })
  .handler(async function* (input, ctx) {
    const total = input?.count ?? 8;
    const every = input?.every ?? 100;
    for (let item = 1; item <= total; item++) {
      yield item;
      if (item < total) await pause(every, ctx.signal);
    }
  })
  .build();

for (const procedure of [ticksProcedure, ticksOnceProcedure, countProcedure]) {
  if (!PROCEDURE_REGISTRY.has(procedure.path)) PROCEDURE_REGISTRY.register(procedure);
}
