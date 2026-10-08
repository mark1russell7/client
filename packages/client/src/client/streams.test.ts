import { describe, it, expect } from "vitest";
import { Client } from "./client.js";
import { defineProcedure } from "../procedures/define.js";
import { outputSchema } from "../procedures/core/schemas.js";
import { ProcedureRegistry } from "../procedures/registry.js";
import type { Message, ResponseItem, Transport } from "./types.js";

describe("routeStream (regression: BUGS-2026-07 H12)", () => {
  it("gives every result to both the iterator and the completion promise", async () => {
    const reg = new ProcedureRegistry();
    for (const name of ["a", "b", "c", "d"]) {
      reg.register(
        defineProcedure({
          path: ["test", name],
          input: outputSchema<Record<string, never>>(),
          output: outputSchema<{ name: string }>(),
          handler: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            return { name };
          },
        })
      );
    }
    const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];
    const client = new Client(stubTransport).useRegistry(reg);

    const response = client.routeStream({ route: { test: { a: {}, b: {}, c: {}, d: {} } } });

    const seen: string[] = [];
    for await (const { path } of response.results) {
      seen.push(path.join("."));
    }
    const complete = await response.complete;

    expect(seen.sort()).toEqual(["test.a", "test.b", "test.c", "test.d"]);
    expect(Object.keys((complete as { test: Record<string, unknown> }).test).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("call() closes the response stream (regression: BUGS-2026-07 M1)", () => {
  it("returns the first item and ends the transport's generator", async () => {
    let closed = false;
    const transport: Transport = {
      name: "test",
      async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
        try {
          yield { id: message.id, status: { type: "success" }, payload: "first" as TRes, metadata: {} } as ResponseItem<TRes>;
          yield { id: message.id, status: { type: "success" }, payload: "second" as TRes, metadata: {} } as ResponseItem<TRes>;
        } finally {
          closed = true;
        }
      },
      close: async () => {},
    } as Transport;
    const client = new Client({ transport });

    const result = await client.call({ service: "test", operation: "x" }, {});

    expect(result).toBe("first");
    expect(closed).toBe(true);
  });
});
