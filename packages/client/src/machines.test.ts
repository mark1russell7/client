/**
 * The state machines of the core as data, and the clock (roadmap R35).
 *
 * - The documents are valid `mark1russell7.machine/1` documents (`machineProblems` of algebra).
 * - The circuit breaker and the WebSocket client report their transitions, and the replay against
 *   the documents finds no disagreement.
 * - A fake clock of `@mark1russell7/service/testing` drives the timers: the times are exact.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { fakeClock } from "@mark1russell7/service/testing";
import { machineProblems, type Machine } from "@mark1russell7/algebra";
import { Client } from "./client/client.js";
import type { Message, ResponseItem, Transport } from "./client/types.js";
import { createCircuitBreakerMiddleware } from "./client/middleware/circuit-breaker.js";
import { createRetryMiddleware } from "./client/middleware/retry.js";
import { WebSocketTransport } from "./adapters/websocket/client/transport.js";
import { ms } from "./duration.js";
import { CIRCUIT_BREAKER_MACHINE, WEBSOCKET_CONNECTION_MACHINE, replayTransitions, type MachineTransition } from "./machines.js";

/** A transport that answers each call with the next outcome of a script: "ok" or "down". */
function scripted(outcomes: Array<"ok" | "down">): Transport & { calls: number } {
  const transport = {
    name: "scripted",
    calls: 0,
    async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
      const outcome = outcomes[transport.calls++] ?? "ok";
      if (outcome === "ok") {
        yield { id: message.id, status: { type: "success", code: 200 }, payload: "ok" as TRes, metadata: {} };
      } else {
        yield { id: message.id, status: { type: "error", code: "UNAVAILABLE", message: "down", retryable: true }, payload: undefined as TRes, metadata: {} };
      }
    },
    close: async () => undefined,
  };
  return transport;
}

const method = { service: "test", operation: "call" };

describe("the machine documents (R35)", () => {
  it("are valid documents of algebra", () => {
    expect(machineProblems(WEBSOCKET_CONNECTION_MACHINE as unknown as Machine)).toEqual([]);
    expect(machineProblems(CIRCUIT_BREAKER_MACHINE as unknown as Machine)).toEqual([]);
  });

  it("find a transition that a document does not allow", () => {
    const events: MachineTransition[] = [
      { machine: CIRCUIT_BREAKER_MACHINE.id, instance: "b", from: "CLOSED", on: "failure-threshold", to: "OPEN", at: 0 },
      { machine: CIRCUIT_BREAKER_MACHINE.id, instance: "b", from: "OPEN", on: "probe-successes", to: "CLOSED", at: 1 },
    ];
    expect(replayTransitions(CIRCUIT_BREAKER_MACHINE, events)).toEqual([
      "b: procedures.machine.circuit-breaker has no transition from OPEN on probe-successes to CLOSED",
    ]);
  });
});

describe("the circuit breaker on a fake clock (R35)", () => {
  it("opens, waits the exact reset time, probes and closes, as its document says", async () => {
    const clock = fakeClock();
    const transitions: MachineTransition[] = [];
    const transport = scripted(["down", "down", "down", "ok", "ok"]);
    const client = new Client({ transport });
    client.use(
      createCircuitBreakerMiddleware({
        failureThreshold: 3,
        successThreshold: 2,
        resetTimeout: ms(5000),
        clock,
        onTransition: (transition) => transitions.push(transition),
      }),
    );
    for (let n = 0; n < 3; n++) await client.call(method, {}).catch(() => undefined);
    expect(transitions.map((transition) => transition.to)).toEqual(["OPEN"]);
    // Open: the call fails at once and does not reach the transport
    await expect(client.call(method, {})).rejects.toThrow();
    expect(transport.calls).toBe(3);

    await clock.advance(4999);
    expect(transitions.map((transition) => transition.to)).toEqual(["OPEN"]);
    await clock.advance(1);
    expect(transitions.map((transition) => transition.to)).toEqual(["OPEN", "HALF_OPEN"]);
    expect(transitions[1]!.at - transitions[0]!.at).toBe(5000);

    await client.call(method, {});
    await client.call(method, {});
    expect(transitions.map((transition) => `${transition.from} -${transition.on}-> ${transition.to}`)).toEqual([
      "CLOSED -failure-threshold-> OPEN",
      "OPEN -reset-timeout-> HALF_OPEN",
      "HALF_OPEN -probe-successes-> CLOSED",
    ]);
    expect(replayTransitions(CIRCUIT_BREAKER_MACHINE, transitions)).toEqual([]);
  });
});

describe("the retry on a fake clock (R35)", () => {
  it("waits the exact backoff before each try", async () => {
    const clock = fakeClock();
    const transport = scripted(["down", "down", "ok"]);
    const client = new Client({ transport });
    client.use(createRetryMiddleware({ maxRetries: 3, retryDelay: ms(1000), jitter: 0, budget: false, idempotent: () => true, clock }));
    const call = client.call(method, {});
    await clock.advance(0);
    expect(transport.calls).toBe(1);
    await clock.advance(999);
    expect(transport.calls).toBe(1);
    await clock.advance(1);
    expect(transport.calls).toBe(2);
    // The second backoff is twice the first
    await clock.advance(1999);
    expect(transport.calls).toBe(2);
    await clock.advance(1);
    expect(await call).toBe("ok");
    expect(transport.calls).toBe(3);
  });
});

describe("the connection of the WebSocket client (R35)", () => {
  let http: HttpServer | undefined;
  let wss: WebSocketServer | undefined;
  afterEach(async () => {
    wss?.close();
    http?.closeAllConnections();
    await new Promise<void>((resolve) => (http ? http.close(() => resolve()) : resolve()));
  });

  /** A plain server that answers the hello, and never answers a ping. */
  async function silentServer(): Promise<{ port: number; sockets: Set<import("ws").WebSocket> }> {
    http = createServer();
    wss = new WebSocketServer({ server: http });
    const sockets = new Set<import("ws").WebSocket>();
    wss.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => http!.listen(0, "127.0.0.1", () => resolve()));
    return { port: (http.address() as AddressInfo).port, sockets };
  }

  const waitFor = async (check: () => boolean) => {
    const end = Date.now() + 5000;
    while (!check() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(check()).toBe(true);
  };

  it("connects, drops, reconnects on the clock, finds a silent server with the heartbeat, and closes", async () => {
    const { port, sockets } = await silentServer();
    const clock = fakeClock();
    const transitions: MachineTransition[] = [];
    const transport = new WebSocketTransport({
      url: `ws://127.0.0.1:${port}`,
      clock,
      onTransition: (transition) => transitions.push(transition),
      reconnect: { enabled: true, initialDelay: ms(1000), maxDelay: ms(1000), jitter: 0 } as never,
      heartbeat: { enabled: true, interval: ms(20_000), timeout: ms(5000) },
    });
    await waitFor(() => transport.isConnected());

    // The server drops the socket: the client waits its backoff on the clock
    for (const socket of sockets) socket.terminate();
    await waitFor(() => transitions.some((transition) => transition.on === "drop"));
    await clock.advance(1000);
    await waitFor(() => transport.isConnected());

    // The server does not answer the ping: after the interval and the pong time, the client drops
    await clock.advance(20_000);
    await clock.advance(5000);
    await waitFor(() => transitions.filter((transition) => transition.on === "drop").length === 2);

    await transport.close();
    const path = transitions.map((transition) => `${transition.from}->${transition.to}`);
    expect(path.slice(0, 4)).toEqual(["DISCONNECTED->CONNECTING", "CONNECTING->CONNECTED", "CONNECTED->RECONNECTING", "RECONNECTING->CONNECTING"]);
    expect(path.slice(-2)).toEqual(["RECONNECTING->DISCONNECTING", "DISCONNECTING->DISCONNECTED"]);
    expect(replayTransitions(WEBSOCKET_CONNECTION_MACHINE, transitions)).toEqual([]);
  });
});
