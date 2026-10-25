/**
 * The MCP host under `run()` of `@mark1russell7/service` (CLI-11). `declare(svc)` gives the host
 * to a service: the runner starts it, and the trigger `stdin-close` starts the staged stop. A
 * fake process of the service gives the triggers and keeps the exit codes.
 *
 * After the stop of the intake, a new tool call gets a retryable `UNAVAILABLE` from the server, and
 * its procedure does not start. The answer of an elicitation and a cancel still pass (CLI-73).
 */

import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { ephemeral, localDev, service, type ServiceBuilder } from "@mark1russell7/service";
import { httpTransport } from "@mark1russell7/service/http";
import { fakeClock, fakeProcess, seeded } from "@mark1russell7/service/testing";
import { createProcedure, defineModule, elicitInput, ms, seconds, type AnyProcedure } from "@procedures/client";
import { createMcpHost, type McpRunnerPart, type McpServiceBuilder } from "./host.js";

const echo: AnyProcedure = createProcedure()
  .path(["test", "echo"])
  .input(z.object({ text: z.string() }))
  .output(z.object({ text: z.string() }))
  .meta({ description: "echo", effects: { reads: [], writes: [] } })
  .handler(async (input: { text: string }) => ({ text: input.text }))
  .build() as AnyProcedure;

const testModule = defineModule("runner-test", [echo]);

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
};

/** The protocol version of the raw requests of the tests. */
const PROTOCOL = "2025-06-18";

/** A tick of the event loop: the work of the promises and of the sockets goes on. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** This function waits until a condition holds, in steps of 5 ms. */
async function until(condition: () => boolean): Promise<void> {
  while (!condition()) await new Promise((resolve) => setTimeout(resolve, 5));
}

type FakeClock = ReturnType<typeof fakeClock>;

/** The cap of the drain of the staged service, in milliseconds. */
const DRAIN_CAP_MS = 1000;

/** A service with short stages: the cooperative abort comes 500 ms after the start of the drain, and the cap 500 ms later. */
function stagedService(name: string): ServiceBuilder {
  return service(name)
    .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
    .liveness({ type: "window", failAfter: seconds(45) })
    .startup(seconds(10))
    .phase("fail readiness", ms(10))
    .phase("stop intake", ms(500))
    .phase("drain", ms(DRAIN_CAP_MS))
    .phase("close transports", ms(500))
    .phase("stop the poller", ms(100))
    .phase("tear down dependencies", ms(500))
    .phase("close the health server", ms(100))
    .cooperativeWindow(ms(500))
    .onRepeatSignal("ignore");
}

/** This function moves the fake clock in steps of 1 ms, with a tick for each step, until the condition holds. */
async function advanceUntil(clock: FakeClock, condition: () => boolean, steps = 3000): Promise<void> {
  for (let step = 0; step < steps && !condition(); step++) {
    await clock.advance(1);
    await tick();
  }
}

/** This function moves the fake clock until the promise settles, and gives its value. */
async function whileAdvancing<T>(clock: FakeClock, promise: Promise<T>): Promise<T> {
  let settled = false;
  const watched = promise.finally(() => {
    settled = true;
  });
  watched.catch(() => undefined);
  await advanceUntil(clock, () => settled);
  return watched;
}

/** A JSON-RPC message of an SSE stream, as far as the tests read it. */
interface Message {
  readonly id?: unknown;
  readonly method?: string;
  readonly result?: unknown;
}

/** The messages of an SSE answer: the JSON of each `data:` line. */
function messagesOf(text: string): Message[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line.trim() !== "data:")
    .map((line) => JSON.parse(line.slice("data: ".length)) as Message);
}

/**
 * The reader of an SSE answer. `next` gives the first message that matches, and reads more of the
 * stream while no message matches.
 */
interface SseReader {
  next(match: (message: Message) => boolean): Promise<Message>;
}

function sseOf(response: Response): SseReader {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const waiting: Message[] = [];
  let rest = "";
  return {
    async next(match) {
      for (;;) {
        const at = waiting.findIndex(match);
        if (at >= 0) return waiting.splice(at, 1)[0]!;
        const chunk = await reader.read();
        if (chunk.done) throw new Error("The SSE answer ended before the message came");
        rest += decoder.decode(chunk.value, { stream: true });
        const lines = rest.split("\n");
        rest = lines.pop() ?? "";
        waiting.push(...messagesOf(lines.join("\n")));
      }
    },
  };
}

const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL };

/** This function sends one JSON-RPC message in a session: a request, a response or a notification. */
function post(endpoint: string, session: string, message: Readonly<Record<string, unknown>>): Promise<Response> {
  return fetch(endpoint, { method: "POST", headers: { ...HEADERS, "mcp-session-id": session }, body: JSON.stringify(message) });
}

/** The JSON-RPC request of a call of a tool without arguments. */
function toolCall(id: number, name: string): Readonly<Record<string, unknown>> {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: {} } };
}

/** A latch: `done` resolves at the first `fire()`, and `fired()` tells if it fired. */
interface Latch {
  readonly done: Promise<void>;
  fire(): void;
  fired(): boolean;
}

function newLatch(): Latch {
  let fired = false;
  let resolve = (): void => undefined;
  const done = new Promise<void>((given) => {
    resolve = given;
  });
  return {
    done,
    fire: () => {
      fired = true;
      resolve();
    },
    fired: () => fired,
  };
}

/** What the procedures of the test of a late call saw (CLI-73). */
interface LateSeen {
  /** The number of runs of `test.late`. */
  lateRuns: number;
  /** This latch fires when `test.hold` starts. */
  readonly holding: Latch;
  /** This latch fires when `test.hold` sees the abort of its call. */
  readonly aborted: Latch;
}

/**
 * The procedures of the test of a late call (CLI-73). `test.ask` asks the person for a name.
 * `test.hold` waits for the abort of its call. `test.late` counts its runs.
 */
function lateModule(seen: LateSeen) {
  const none = { reads: [], writes: [] };
  const ask = createProcedure()
    .path(["test", "ask"])
    .input(z.object({}).passthrough())
    .output(z.object({ action: z.string(), name: z.string().nullable() }))
    .meta({ description: "ask the person for a name", effects: none })
    .handler(async (_input, ctx) => {
      const answer = await elicitInput(ctx, { message: "Your name?", fields: { name: { type: "string", title: "Name" } }, required: ["name"] });
      const name = answer.content?.["name"];
      return { action: answer.action, name: typeof name === "string" ? name : null };
    })
    .build() as AnyProcedure;
  const hold = createProcedure()
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
    .build() as AnyProcedure;
  const late = createProcedure()
    .path(["test", "late"])
    .input(z.object({}).passthrough())
    .output(z.object({ done: z.boolean() }))
    .meta({ description: "count the runs", effects: none })
    .handler(async () => {
      seen.lateRuns++;
      return { done: true };
    })
    .build() as AnyProcedure;
  return defineModule("runner-late", [ask, hold, late]);
}

describe("McpHost.declare", () => {
  it("declares the server part, and the trigger stdin-close for a stdio face", () => {
    const calls: string[] = [];
    const parts: McpRunnerPart[] = [];
    const builder: McpServiceBuilder = {
      server: (name, _knobs, impl) => {
        calls.push(`server ${name}`);
        parts.push(impl);
      },
      dependency: (name) => calls.push(`dependency ${name}`),
      trigger: (trigger) => calls.push(`trigger ${trigger}`),
    };
    const stdio = createMcpHost({ modules: [testModule], faces: { stdio: { stdin: new PassThrough(), stdout: new PassThrough(), redirectConsole: false } } });
    expect(stdio.declare(builder)).toBe(builder);
    expect(calls).toEqual(["server mcp", "trigger stdin-close"]);
    expect(() => stdio.declare(builder)).toThrow("one time");
    return expect(stdio.start()).rejects.toThrow("run() of the service starts it");
  });

  it("closes the task store of the host in the close of the runner part (CLI-35)", async () => {
    const parts: McpRunnerPart[] = [];
    const host = createMcpHost({ modules: [testModule], faces: { http: {} }, tasks: {} });
    host.declare({ server: (_name, _knobs, impl) => parts.push(impl), dependency: () => undefined, trigger: () => undefined });
    await parts[0]!.start(new AbortController().signal, undefined);
    const store = host.tasks!;
    await parts[0]!.close();
    await host.closed;
    // The store closed: it starts no task
    await expect(store.createTask({}, 1, { method: "tools/call", params: { name: "test.echo" } })).rejects.toThrow(/stopping/);
  });

  it("declares no trigger without a stdio face", () => {
    const calls: string[] = [];
    const host = createMcpHost({ modules: [testModule], faces: { http: {} } });
    host.declare({ server: (name) => calls.push(`server ${name}`), dependency: () => undefined, trigger: (trigger) => calls.push(`trigger ${trigger}`) });
    expect(calls).toEqual(["server mcp"]);
  });

  it("runs over stdio until the trigger stdin-close, then stops in stages and exits with 0", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const lines: string[] = [];
    stdout.on("data", (chunk: Buffer) => lines.push(...chunk.toString("utf8").split("\n").filter(Boolean)));
    const host = createMcpHost({ modules: [testModule], faces: { stdio: { stdin, stdout, redirectConsole: false } } });
    const proc = fakeProcess();
    const life = await host.declare(service("mcp-test").profile(ephemeral)).run({ process: proc });
    expect(life.state).toBe("running");
    expect(host.state()).toMatchObject({ running: true, faces: [{ transport: "stdio", running: true }] });

    stdin.write(JSON.stringify(INITIALIZE) + "\n");
    await until(() => lines.length > 0);
    expect(JSON.parse(lines[0]!)).toMatchObject({ id: 1, result: { serverInfo: { name: "procedure-server" } } });

    // The end of the stream alone does not stop a host of a service: the runner owns the stop
    stdin.end();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(host.state().running).toBe(true);

    proc.trigger("stdin-close");
    expect(await life.done).toBe(0);
    await host.closed;
    expect(proc.exits).toEqual([0]);
    expect(host.state()).toMatchObject({ running: false, faces: [{ running: false }] });
  });

  it("serves Streamable HTTP on a listener of the service, and the stop closes it", async () => {
    const host = createMcpHost({ modules: [testModule], faces: { http: {} } });
    const listener = httpTransport(
      createServer(),
      { server_idle_close: seconds(5), server_idle_sweep_interval: seconds(1), server_retry_after: seconds(1) },
      { listen: { port: 0, host: "127.0.0.1" } },
    );
    listener.mount((req, res) => host.handleHttp(req, res));
    // localDev leaves the policies to the service
    const svc = host
      .declare(service("mcp-http-test").profile(localDev))
      .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
      .liveness({ type: "window", failAfter: seconds(45) })
      .startup(seconds(30));
    svc.server("mcp-http-test.listen", listener.knobs, listener);
    const proc = fakeProcess();
    const life = await svc.run({ process: proc });
    const { port } = listener.server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify(INITIALIZE),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeTruthy();
    await response.body?.cancel();
    // Another path is not the endpoint: the listener answers it, not the MCP face
    const other = await fetch(`http://127.0.0.1:${port}/other`);
    expect(other.status).toBe(404);

    proc.signal("SIGTERM");
    await life.done;
    await host.closed;
    expect(host.state().running).toBe(false);
    expect(listener.server.listening).toBe(false);
  });

  it("ends the idle GET streams of the HTTP face at the stop of the intake: the stop ends well under the cap of the drain (CLI-72)", async () => {
    const clock = fakeClock();
    const drainCapMs = DRAIN_CAP_MS;
    const host = createMcpHost({ modules: [testModule], faces: { http: {} } });
    const listener = httpTransport(
      createServer(),
      { server_idle_close: seconds(5), server_idle_sweep_interval: seconds(1), server_retry_after: seconds(1) },
      { listen: { port: 0, host: "127.0.0.1" }, clock },
    );
    listener.mount((req, res) => host.handleHttp(req, res));
    const svc = host.declare(stagedService("mcp-idle-test"));
    svc.server("mcp-idle-test.listen", listener.knobs, listener);
    const life = await svc.run({ clock, process: fakeProcess({ clock }), random: seeded(7) });
    await clock.advance(0);
    const endpoint = `http://127.0.0.1:${(listener.server.address() as AddressInfo).port}/mcp`;

    // Six idle clients, as on the fleet site: each one keeps its GET stream open
    const streams: Array<Promise<string>> = [];
    for (let client = 0; client < 6; client++) {
      const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL };
      const initialized = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(INITIALIZE) });
      const session = initialized.headers.get("mcp-session-id")!;
      await initialized.text();
      const notified = await fetch(endpoint, { method: "POST", headers: { ...headers, "mcp-session-id": session }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
      await notified.text();
      const stream = await fetch(endpoint, { headers: { accept: "text/event-stream", "mcp-session-id": session, "mcp-protocol-version": PROTOCOL } });
      expect(stream.status).toBe(200);
      const text = stream.text();
      // The test reads the result later: a cut stream must not be an unhandled rejection before that
      text.catch(() => undefined);
      streams.push(text);
    }

    const startedAt = clock.now();
    let exited = false;
    void life.shutdown("the test stops the host").then(() => {
      exited = true;
    });
    for (let step = 0; step < 3000 && !exited; step++) {
      await clock.advance(1);
      await tick();
    }
    const elapsed = clock.now() - startedAt;
    // The record of the run gives the measured stop
    console.info(`CLI-72: the stop of createMcpHost with 6 idle MCP sessions took ${elapsed} ms on the fake clock (the cap of the drain is ${drainCapMs} ms)`);
    expect(exited).toBe(true);
    // Before CLI-72, the drain waited for its full cap of 1000 ms: the stop took more than 1010 ms
    expect(elapsed).toBeLessThan(drainCapMs / 4);
    // Each stream ended in its protocol, before the close of the listener: no stream was cut
    for (const stream of streams) await expect(stream).resolves.toBeTypeOf("string");
    await host.closed;
  }, 20000);

  it("refuses a new tool call after the stop of the intake, and lets the answer of an elicitation and a cancel pass (CLI-73)", async () => {
    const clock = fakeClock();
    const seen: LateSeen = { lateRuns: 0, holding: newLatch(), aborted: newLatch() };
    // The server uses the clock of the service, so its drain waits on the fake clock
    const host = createMcpHost({ modules: [lateModule(seen)], faces: { http: {} }, serverOptions: { clock } });
    // The app mounts the face on a listener of its own, so the face answers each request through the drain
    const app = createServer((req, res) => {
      if (host.handleHttp(req, res)) return;
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", () => resolve()));
    const endpoint = `http://127.0.0.1:${(app.address() as AddressInfo).port}/mcp`;
    const life = await host.declare(stagedService("mcp-late-test")).run({ clock, process: fakeProcess({ clock }), random: seeded(7) });
    await clock.advance(0);
    try {
      // A session whose client can answer the questions of the server (form elicitation)
      const initialized = await fetch(endpoint, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ ...INITIALIZE, params: { ...INITIALIZE.params, capabilities: { elicitation: {} } } }),
      });
      const session = initialized.headers.get("mcp-session-id")!;
      await initialized.text();
      expect((await post(endpoint, session, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
      const stream = await fetch(endpoint, { headers: { accept: "text/event-stream", "mcp-session-id": session, "mcp-protocol-version": PROTOCOL } });
      expect(stream.status).toBe(200);
      let streamEnded = false;
      const streamText = stream.text().finally(() => {
        streamEnded = true;
      });
      streamText.catch(() => undefined);
      // Two calls in progress at the stop: a question to the person, and a call that waits for its cancel
      const asking = sseOf(await post(endpoint, session, toolCall(2, "test.ask")));
      const question = await asking.next((message) => message.method === "elicitation/create");
      const holding = await post(endpoint, session, toolCall(3, "test.hold"));
      await seen.holding.done;

      const startedAt = clock.now();
      let exited = false;
      void life.shutdown("the test stops the host").then(() => {
        exited = true;
      });
      // The stop of the intake ends the GET stream (CLI-72)
      await advanceUntil(clock, () => streamEnded);
      expect(streamEnded).toBe(true);

      // A new tool call gets the refusal of the server: a retryable UNAVAILABLE. Its procedure does not start.
      const late = await post(endpoint, session, toolCall(4, "test.late"));
      expect(late.status).toBe(200);
      const refusal = messagesOf(await whileAdvancing(clock, late.text())).find((message) => message.id === 4);
      expect(refusal?.result).toMatchObject({
        content: [{ type: "text", text: "The server is stopping" }],
        isError: true,
        _meta: { code: "UNAVAILABLE", retryable: true },
      });
      expect(seen.lateRuns).toBe(0);

      // The answer of the person reaches the call in progress, and the call completes
      const answered = await post(endpoint, session, { jsonrpc: "2.0", id: question.id, result: { action: "accept", content: { name: "Ada" } } });
      expect(answered.status).toBe(202);
      await answered.text();
      const result = await whileAdvancing(clock, asking.next((message) => message.id === 2));
      expect(result.result).toMatchObject({ structuredContent: { action: "accept", name: "Ada" } });

      // The cancel reaches the other call. The test does not move the clock until the abort, so the
      // cooperative abort of the drain cannot be the cause.
      expect(seen.aborted.fired()).toBe(false);
      const cancelled = await post(endpoint, session, { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 3, reason: "the client cancels the call" } });
      expect(cancelled.status).toBe(202);
      await cancelled.text();
      await seen.aborted.done;

      // No call holds the drain now: the stop ends well before the cap of the drain
      await advanceUntil(clock, () => exited);
      expect(exited).toBe(true);
      expect(clock.now() - startedAt).toBeLessThan(DRAIN_CAP_MS / 2);
      await holding.body?.cancel().catch(() => undefined);
      await host.closed;
    } finally {
      if (life.state !== "exited") {
        void life.shutdown("the test ended");
        await advanceUntil(clock, () => life.state === "exited");
      }
      await new Promise<void>((resolve) => {
        app.close(() => resolve());
        app.closeAllConnections();
      });
    }
  }, 20000);
});
