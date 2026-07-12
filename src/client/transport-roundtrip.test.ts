import { describe, it, expect } from "vitest";
import { Client } from "./client.js";
import { LocalTransport } from "../adapters/local/client/index.js";
import type { ClientRunner, ClientContext } from "./types.js";

// End-to-end round trips through Client -> middleware chain -> transport -> handler -> response.
// The audit noted the Client/transport/middleware seam had zero tests; these cover the happy path,
// that middleware actually runs in the pipeline, and that handler errors propagate.

describe("Client + LocalTransport round trip", () => {
  it("returns the handler result via client.call()", async () => {
    const transport = new LocalTransport();
    transport.register(
      { service: "math", operation: "add" },
      (payload: { a: number; b: number }) => ({ sum: payload.a + payload.b })
    );
    const client = new Client(transport);

    const result = await client.call({ service: "math", operation: "add" }, { a: 2, b: 3 });
    expect(result).toEqual({ sum: 5 });
  });

  it("runs the middleware chain in the round trip", async () => {
    const transport = new LocalTransport();
    transport.register({ service: "svc", operation: "op" }, () => ({ ok: true }));

    let calls = 0;
    const counting =
      <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> =>
      async function* (context: ClientContext<TReq>) {
        calls++;
        yield* next(context);
      };

    const client = new Client(transport).use(counting);
    const result = await client.call({ service: "svc", operation: "op" }, {});
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(1);
  });

  it("propagates a handler error", async () => {
    const transport = new LocalTransport();
    transport.register({ service: "svc", operation: "boom" }, () => {
      throw new Error("handler failed");
    });
    const client = new Client(transport);

    await expect(client.call({ service: "svc", operation: "boom" }, {})).rejects.toThrow();
  });

  it("streams the response via client.stream()", async () => {
    const transport = new LocalTransport();
    transport.register({ service: "svc", operation: "one" }, () => ({ n: 42 }));
    const client = new Client(transport);

    const items: unknown[] = [];
    for await (const item of client.stream({ service: "svc", operation: "one" }, {})) {
      items.push(item);
    }
    expect(items).toEqual([{ n: 42 }]);
  });
});
