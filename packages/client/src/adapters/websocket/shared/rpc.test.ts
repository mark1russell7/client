/**
 * The incoming calls of a socket (audit pass 2): a request that ends late does not delete the
 * credit of a newer request with the same id.
 */

import { describe, it, expect } from "vitest";
import { IncomingCalls } from "./rpc.js";
import type { RequestHandler, ServerRequest } from "../../../server/types.js";
import type { WebSocketMessage } from "../server/types.js";

const ticks = async (n = 5): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve));
};

describe("IncomingCalls", () => {
  it("keeps the credit of a newer request with the same id when the old request ends", async () => {
    let releaseOld: () => void = () => undefined;
    const oldReturned = new Promise<void>((resolve) => (releaseOld = resolve));
    // The old stream gives one item, then its return() waits until the test lets it go
    const oldStream: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: false, value: "old" }),
        return: async () => {
          await oldReturned;
          return { done: true, value: undefined };
        },
      }),
    };
    async function* newStream(): AsyncGenerator<unknown> {
      yield "b1";
      yield "b2";
      yield "b3";
    }
    const streams = [oldStream, newStream()];
    const handler = {
      handle: async () => ({ status: { type: "success", code: 200 }, payload: null, metadata: {}, stream: streams.shift() }),
    } as unknown as RequestHandler;
    const sent: WebSocketMessage[] = [];
    const calls = new IncomingCalls({
      handler,
      send: (frame) => sent.push(frame),
      isOpen: () => true,
      requestOf: () => ({}) as ServerRequest,
    });
    const request = { id: "1", type: "request", method: { service: "s", operation: "o" }, credit: 1 } as unknown as WebSocketMessage;

    calls.receive(request);
    await ticks();
    calls.receive({ id: "1", type: "cancel" } as WebSocketMessage);
    await ticks();
    // The new request has the same id, while the old one waits in its return()
    calls.receive(request);
    await ticks();
    releaseOld();
    await ticks();
    calls.receive({ id: "1", type: "credit", credit: 5 } as WebSocketMessage);
    await ticks();

    const payloads = sent.filter((frame) => frame.type === "stream" && frame.stream?.done === false).map((frame) => frame.payload);
    expect(payloads).toEqual(["old", "b1", "b2", "b3"]);
    expect(sent.at(-1)).toMatchObject({ id: "1", type: "stream", stream: { done: true } });
  });
});
