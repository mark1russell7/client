/**
 * The end of the SSE stream of a cancelled call (CLI-74). The SDK sends no answer to a request that
 * the client cancels, so before, the stream of its POST stayed open until the close of the session.
 * Then the drain of a listener waited for that stream until its deadline. The endpoint ends the
 * stream when each request of its POST has its answer or is cancelled.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { ProcedureServer, createProcedure, createRegistry, type AnyProcedure } from "@procedures/client";
import { McpServerTransport } from "./mcp-transport.js";

const PROTOCOL = "2025-06-18";
const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL };

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

/** A promise and the function that resolves it. */
interface Latch {
  readonly done: Promise<void>;
  fire(): void;
}

function newLatch(): Latch {
  let fire = (): void => undefined;
  const done = new Promise<void>((resolve) => {
    fire = resolve;
  });
  return { done, fire: () => fire() };
}

/** What the procedures of the test saw, and the gate of `test.gate`. */
interface Seen {
  readonly holding: Latch;
  readonly aborted: Latch;
  readonly entered: Latch;
  readonly gate: Latch;
}

/** `test.hold` waits for the abort of its call. `test.gate` waits until the test opens the gate. */
function registryOf(seen: Seen) {
  const none = { reads: [], writes: [] };
  const hold: AnyProcedure = createProcedure()
    .path(["test", "hold"])
    .input(z.object({}).passthrough())
    .output(z.object({ aborted: z.boolean() }))
    .meta({ description: "wait for the abort of the call", effects: none })
    .handler(async (_input, ctx) => {
      seen.holding.fire();
      await new Promise<void>((resolve) => {
        if (ctx.signal?.aborted) resolve();
        ctx.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      seen.aborted.fire();
      return { aborted: true };
    })
    .build();
  const gate: AnyProcedure = createProcedure()
    .path(["test", "gate"])
    .input(z.object({}).passthrough())
    .output(z.object({ done: z.boolean() }))
    .meta({ description: "wait for the gate", effects: none })
    .handler(async () => {
      seen.entered.fire();
      await seen.gate.done;
      return { done: true };
    })
    .build();
  return createRegistry({ name: "cancel", procedures: [hold, gate] });
}

/** This function starts the endpoint on a listener of `node:http`, and gives its URL. */
async function start(seen: Seen): Promise<string> {
  const registry = registryOf(seen);
  const server = new ProcedureServer({ registry, autoRegister: true });
  const mcp = new McpServerTransport(server, { registry, transport: "http" });
  server.addTransport(mcp);
  await server.start();
  cleanups.push(() => server.stop());
  const listener = createServer((req, res) => {
    if (mcp.handleHttp(req, res)) return;
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        listener.close(() => resolve());
        listener.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${(listener.address() as AddressInfo).port}/mcp`;
}

/** This function sends a body in a session: one JSON-RPC message, or a batch. */
function post(endpoint: string, session: string, body: unknown): Promise<Response> {
  return fetch(endpoint, { method: "POST", headers: { ...HEADERS, "mcp-session-id": session }, body: JSON.stringify(body) });
}

/** This function starts a session and gives its id. */
async function initialize(endpoint: string): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "cancel-test", version: "0" } } }),
  });
  const session = response.headers.get("mcp-session-id")!;
  await response.text();
  await (await post(endpoint, session, { jsonrpc: "2.0", method: "notifications/initialized" })).text();
  return session;
}

/** The JSON-RPC request of a call of a tool without arguments. */
function toolCall(id: number, name: string): Readonly<Record<string, unknown>> {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: {} } };
}

/** The cancel of a request. */
function cancel(requestId: number): Readonly<Record<string, unknown>> {
  return { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId, reason: "the client cancels the call" } };
}

/** The ids of the messages of an SSE answer: the JSON of each `data:` line. */
function idsOf(text: string): unknown[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line.trim() !== "data:")
    .map((line) => (JSON.parse(line.slice("data: ".length)) as { id?: unknown }).id);
}

/** This function watches the stream of a response: `text` resolves at its end. */
function watch(response: Response): { readonly text: Promise<string>; readonly ended: () => boolean } {
  let ended = false;
  const text = response.text().finally(() => {
    ended = true;
  });
  text.catch(() => undefined);
  return { text, ended: () => ended };
}

function newSeen(): Seen {
  return { holding: newLatch(), aborted: newLatch(), entered: newLatch(), gate: newLatch() };
}

describe("the stream of a cancelled call (CLI-74)", () => {
  it("ends the stream of a cancelled call, and the call gets no answer", async () => {
    const seen = newSeen();
    const endpoint = await start(seen);
    const session = await initialize(endpoint);
    const holding = watch(await post(endpoint, session, toolCall(2, "test.hold")));
    await seen.holding.done;

    const cancelled = await post(endpoint, session, cancel(2));
    expect(cancelled.status).toBe(202);
    await cancelled.text();
    await seen.aborted.done;
    // Before CLI-74, the stream stayed open until the close of the session
    expect(idsOf(await holding.text)).not.toContain(2);
  });

  it("keeps the stream of a batch until each other request of the batch has its answer", async () => {
    const seen = newSeen();
    const endpoint = await start(seen);
    const session = await initialize(endpoint);
    const batch = watch(await post(endpoint, session, [toolCall(2, "test.hold"), toolCall(3, "test.gate")]));
    await Promise.all([seen.holding.done, seen.entered.done]);

    const cancelled = await post(endpoint, session, cancel(2));
    expect(cancelled.status).toBe(202);
    await cancelled.text();
    await seen.aborted.done;
    // The other call of the batch still waits for its answer on the same stream
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(batch.ended()).toBe(false);

    seen.gate.fire();
    const ids = idsOf(await batch.text);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);
  });
});
