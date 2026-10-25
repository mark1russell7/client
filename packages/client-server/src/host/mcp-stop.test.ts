/**
 * The MCP face at the stop of the host (CLI-72).
 *
 * - The stop of the intake ends the GET stream of each idle session. Thus a stop with idle MCP
 *   clients ends well under the cap of the drain. Before, each GET stream stayed open until the
 *   close of the face, so the drain of the listener waited for its full cap (fleet #24).
 * - A call in progress at the stop completes, with its answer stream. The drain waits only for it.
 * - A session with a task in progress keeps its GET stream until the work of the task ends. The
 *   end of the task goes on that stream.
 * - After the stop of the intake, a new GET stream and a new session get 503.
 * - After the stop of the intake, a new tool call in a session gets a retryable `UNAVAILABLE`, and
 *   its procedure does not start. The answer of an elicitation and a cancel still pass (CLI-73).
 *
 * The host and its service run on a fake clock, so the test measures each stop on that clock.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { service, type Lifecycle, type ServiceBuilder } from "@mark1russell7/service";
import { fakeClock, fakeProcess, seeded } from "@mark1russell7/service/testing";
import { createProcedure, createRegistry, elicitInput, ms, seconds, type AnyProcedure, type ProcedureRegistry } from "@procedures/client";
import { mcpFace } from "@procedures/mcp-server";
import { createProcedureHost, LOCAL_LISTENER_KNOBS, type ProcedureHost } from "./index.js";

type FakeClock = ReturnType<typeof fakeClock>;

/** The cap of the drain of the test service, in milliseconds. */
const DRAIN_CAP_MS = 1000;
/** The fake time of each step of the test, in milliseconds. */
const STEP_MS = 1;
const PROTOCOL = "2025-06-18";
const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL };

/** A service with short stages: the cooperative abort comes 500 ms after the start of the drain, and the cap 500 ms later. */
function serviceOf(name: string): ServiceBuilder {
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

/** A gate that the test opens: the procedure `test.wait` waits for it. */
interface Gate {
  readonly entered: Promise<void>;
  readonly opened: Promise<void>;
  enter(): void;
  open(): void;
}

function newGate(): Gate {
  let enter = (): void => undefined;
  let open = (): void => undefined;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { entered, opened, enter: () => enter(), open: () => open() };
}

let gate = newGate();
let cleanups: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  gate.open();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  gate = newGate();
});

/** The procedure of the test: it waits until the test opens the gate. It runs as a task when the client asks for one. */
function registryOf() {
  const meta: Record<string, unknown> = { description: "wait for the gate", effects: { reads: [], writes: [] }, taskSupport: "optional" };
  const wait = createProcedure()
    .path(["test", "wait"])
    .input(z.object({}).passthrough())
    .output(z.object({ done: z.boolean() }))
    .meta(meta as never)
    .handler(async () => {
      gate.enter();
      await gate.opened;
      return { done: true };
    })
    .build() as AnyProcedure;
  return createRegistry({ name: "mcp-stop", procedures: [wait] });
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
function lateRegistryOf(seen: LateSeen) {
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
  return createRegistry({ name: "mcp-late", procedures: [ask, hold, late] });
}

/** A tick of the event loop: the work of the promises and of the sockets goes on. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** This function moves the fake clock step by step, with a tick for each step, until the condition holds. */
async function advanceUntil(clock: FakeClock, condition: () => boolean, steps = 3000): Promise<void> {
  for (let step = 0; step < steps && !condition(); step++) {
    await clock.advance(STEP_MS);
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

/** A host with the MCP face under `run()` on a fake clock. Without `onListener`, the app mounts the face on a listener of its own. */
async function runHost(
  name: string,
  options: { readonly onListener: boolean; readonly tasks?: boolean; readonly registry?: ProcedureRegistry },
): Promise<{ host: ProcedureHost; life: Lifecycle; clock: FakeClock; endpoint: string }> {
  const clock = fakeClock();
  const host = createProcedureHost({
    name,
    registry: options.registry ?? registryOf(),
    clock,
    faces: { mcp: mcpFace({ serverInfo: { name, version: "0.0.0" }, ...(options.tasks ? { tasks: {} } : {}) }) },
    ...(options.onListener ? { listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }] } : {}),
  });
  let endpoint: string;
  if (options.onListener) {
    endpoint = "";
  } else {
    const app: Server = createServer((req, res) => {
      if (host.handler(req, res)) return;
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          app.close(() => resolve());
          app.closeAllConnections();
        }),
    );
    endpoint = `http://127.0.0.1:${(app.address() as AddressInfo).port}/mcp`;
  }
  const life = await host.declare(serviceOf(name)).run({ clock, process: fakeProcess({ clock }), random: seeded(7) });
  await clock.advance(0);
  if (options.onListener) endpoint = host.info.endpoints().find((each) => each.type === "mcp")!.address;
  cleanups.push(async () => {
    if (life.state === "exited") return;
    void life.shutdown("the test ended");
    await advanceUntil(clock, () => life.state === "exited");
  });
  return { host, life, clock, endpoint };
}

/** A JSON-RPC message of an SSE stream, as far as the test reads it. */
interface Message {
  readonly id?: unknown;
  readonly method?: string;
  readonly params?: { readonly status?: string };
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

/** This function sends one JSON-RPC message in a session: a request, a response or a notification. */
function post(endpoint: string, session: string, message: Readonly<Record<string, unknown>>): Promise<Response> {
  return fetch(endpoint, { method: "POST", headers: { ...HEADERS, "mcp-session-id": session }, body: JSON.stringify(message) });
}

/** The JSON-RPC request of a call of a tool without arguments. */
function toolCall(id: number, name: string): Readonly<Record<string, unknown>> {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: {} } };
}

/** This function starts a session with `initialize` and `notifications/initialized`, and gives its id. */
async function initialize(endpoint: string, capabilities: Readonly<Record<string, unknown>> = {}): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities, clientInfo: { name: "mcp-stop-test", version: "0" } } }),
  });
  expect(response.status).toBe(200);
  const session = response.headers.get("mcp-session-id");
  expect(session).toBeTruthy();
  await response.text();
  const initialized = await fetch(endpoint, { method: "POST", headers: { ...HEADERS, "mcp-session-id": session! }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  expect(initialized.status).toBe(202);
  await initialized.text();
  return session!;
}

/** The GET stream of a session: `text` resolves at the end of the stream, and rejects when the server cuts it. */
interface Stream {
  readonly status: number;
  readonly text: Promise<string>;
  readonly ended: () => boolean;
}

async function openStream(endpoint: string, session: string): Promise<Stream> {
  const response = await fetch(endpoint, { headers: { accept: "text/event-stream", "mcp-session-id": session, "mcp-protocol-version": PROTOCOL } });
  let ended = false;
  const text = response.text().finally(() => {
    ended = true;
  });
  // The test reads the result later: a cut stream must not be an unhandled rejection before that
  text.catch(() => undefined);
  return { status: response.status, text, ended: () => ended };
}

/** A tool call in a session. `task: true` asks for a task. The answer is the text of its SSE stream. */
function callTool(endpoint: string, session: string, id: number, task = false): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: { ...HEADERS, "mcp-session-id": session },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "test.wait", arguments: {}, ...(task ? { task: {} } : {}) } }),
  });
}

/** The start of a stop: the time of the fake clock, and a function that tells if the service exited. */
function startStop(life: Lifecycle, clock: FakeClock): { readonly startedAt: number; readonly exited: () => boolean } {
  const startedAt = clock.now();
  let exited = false;
  void life.shutdown("the test stops the host").then(() => {
    exited = true;
  });
  return { startedAt, exited: () => exited };
}

describe("the MCP face at the stop of the host (CLI-72)", () => {
  it("ends the GET streams of idle sessions at the stop of the intake: the stop ends well under the cap of the drain", async () => {
    const { life, clock, endpoint } = await runHost("mcp-idle", { onListener: true });
    // Six idle clients, as on the fleet site (fleet #24): each one keeps its GET stream open
    const streams: Stream[] = [];
    for (let client = 0; client < 6; client++) streams.push(await openStream(endpoint, await initialize(endpoint)));
    expect(streams.map((stream) => stream.status)).toEqual([200, 200, 200, 200, 200, 200]);
    await tick();
    expect(streams.some((stream) => stream.ended())).toBe(false);

    const stop = startStop(life, clock);
    await advanceUntil(clock, stop.exited);
    const elapsed = clock.now() - stop.startedAt;
    // The record of the run gives the measured stop
    console.info(`CLI-72: the stop with 6 idle MCP sessions took ${elapsed} ms on the fake clock (the cap of the drain is ${DRAIN_CAP_MS} ms)`);
    expect(stop.exited()).toBe(true);
    // Before CLI-72, the drain waited for its full cap of 1000 ms: the stop took more than 1010 ms
    expect(elapsed).toBeLessThan(DRAIN_CAP_MS / 4);
    // Each stream ended in its protocol, before the close of the listener: no stream was cut
    for (const stream of streams) await expect(stream.text).resolves.toBeTypeOf("string");
  }, 20000);

  it("lets a call in progress complete with its answer stream: the drain waits only for the call", async () => {
    const { life, clock, endpoint } = await runHost("mcp-call", { onListener: true });
    const idle: Stream[] = [];
    for (let client = 0; client < 3; client++) idle.push(await openStream(endpoint, await initialize(endpoint)));
    // A session with a GET stream and a call in progress
    const busy = await initialize(endpoint);
    const busyStream = await openStream(endpoint, busy);
    const call = callTool(endpoint, busy, 2);
    await gate.entered;

    const stop = startStop(life, clock);
    await advanceUntil(clock, () => busyStream.ended() && idle.every((stream) => stream.ended()));
    // A call is not an answer of the GET stream: each GET stream ended at the stop of the intake
    expect(idle.every((stream) => stream.ended()) && busyStream.ended()).toBe(true);
    // The drain waits for the call
    const waitUntil = clock.now() + 200;
    await advanceUntil(clock, () => clock.now() >= waitUntil || stop.exited());
    expect(stop.exited()).toBe(false);

    const releasedAt = clock.now();
    gate.open();
    const answer = await call;
    expect(answer.status).toBe(200);
    const messages = messagesOf(await whileAdvancing(clock, answer.text()));
    const result = messages.find((message) => message.id === 2) as { result?: { isError?: boolean; content?: Array<{ text?: string }> } } | undefined;
    expect(result?.result?.isError).not.toBe(true);
    expect(JSON.stringify(result?.result)).toMatch(/\\?"done\\?":\s*true/);

    await advanceUntil(clock, stop.exited);
    expect(stop.exited()).toBe(true);
    // The stop ended soon after the end of the call, well before the cap of the drain
    expect(clock.now() - releasedAt).toBeLessThan(DRAIN_CAP_MS / 4);
    expect(clock.now() - stop.startedAt).toBeLessThan(DRAIN_CAP_MS / 2);
    for (const stream of [...idle, busyStream]) await expect(stream.text).resolves.toBeTypeOf("string");
  }, 20000);

  it("keeps the GET stream of a session with a task in progress until the work of the task ends", async () => {
    const { life, clock, endpoint } = await runHost("mcp-task", { onListener: true, tasks: true });
    const idle = await openStream(endpoint, await initialize(endpoint));
    const working = await initialize(endpoint);
    const workingStream = await openStream(endpoint, working);
    const created = await callTool(endpoint, working, 2, true);
    const task = messagesOf(await created.text()).find((message) => message.id === 2) as { result?: { task?: { taskId?: string; status?: string } } } | undefined;
    expect(task?.result?.task?.status).toBe("working");
    await gate.entered;

    const stop = startStop(life, clock);
    await advanceUntil(clock, idle.ended);
    expect(idle.ended()).toBe(true);
    // The session with the task keeps its stream through the drain
    const waitUntil = clock.now() + 200;
    await advanceUntil(clock, () => clock.now() >= waitUntil || workingStream.ended());
    expect(workingStream.ended()).toBe(false);
    expect(stop.exited()).toBe(false);

    const releasedAt = clock.now();
    gate.open();
    await advanceUntil(clock, stop.exited);
    expect(stop.exited()).toBe(true);
    expect(clock.now() - releasedAt).toBeLessThan(DRAIN_CAP_MS / 4);
    // The end of the task went on the stream, and then the stream ended in its protocol
    const statuses = messagesOf(await workingStream.text).filter((message) => message.method === "notifications/tasks/status");
    expect(statuses.map((message) => message.params?.status)).toContain("completed");
    await expect(idle.text).resolves.toBeTypeOf("string");
  }, 20000);

  it("refuses a new GET stream and a new session after the stop of the intake, with 503 and Retry-After", async () => {
    // The app mounts the face on a listener of its own, so the face answers each request through the drain
    const { life, clock, endpoint } = await runHost("mcp-refuse", { onListener: false });
    const session = await initialize(endpoint);
    const stream = await openStream(endpoint, session);
    // A call in progress keeps the host in its drain
    const call = callTool(endpoint, session, 2);
    await gate.entered;

    const stop = startStop(life, clock);
    await advanceUntil(clock, stream.ended);
    expect(stream.ended()).toBe(true);
    await expect(stream.text).resolves.toBeTypeOf("string");
    expect(stop.exited()).toBe(false);

    const refusals = [
      await fetch(endpoint, { headers: { accept: "text/event-stream", "mcp-session-id": session, "mcp-protocol-version": PROTOCOL } }),
      await fetch(endpoint, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "late", version: "0" } } }),
      }),
    ];
    for (const refusal of refusals) {
      expect(refusal.status).toBe(503);
      expect(refusal.headers.get("retry-after")).toBe("5");
      expect(await refusal.json()).toMatchObject({ error: { message: "The server is stopping", data: { code: "UNAVAILABLE" } } });
    }

    // The call in progress completes
    gate.open();
    const answer = await call;
    expect(answer.status).toBe(200);
    expect(JSON.stringify(messagesOf(await whileAdvancing(clock, answer.text())).find((message) => message.id === 2))).toMatch(/\\?"done\\?":\s*true/);
    await advanceUntil(clock, stop.exited);
    expect(stop.exited()).toBe(true);
  }, 20000);

  it("refuses a new tool call after the stop of the intake, and lets the answer of an elicitation and a cancel pass (CLI-73)", async () => {
    const seen: LateSeen = { lateRuns: 0, holding: newLatch(), aborted: newLatch() };
    // The app mounts the face on a listener of its own, so the face answers each request through the drain
    const { life, clock, endpoint } = await runHost("mcp-late", { onListener: false, registry: lateRegistryOf(seen) });
    // The client can answer the questions of the server (form elicitation)
    const session = await initialize(endpoint, { elicitation: {} });
    const stream = await openStream(endpoint, session);
    // Two calls in progress at the stop: a question to the person, and a call that waits for its cancel
    const asking = sseOf(await post(endpoint, session, toolCall(2, "test.ask")));
    const question = await asking.next((message) => message.method === "elicitation/create");
    const holding = await post(endpoint, session, toolCall(3, "test.hold"));
    await seen.holding.done;

    const stop = startStop(life, clock);
    await advanceUntil(clock, stream.ended);
    expect(stream.ended()).toBe(true);

    // A new tool call gets the refusal of the stop: a retryable UNAVAILABLE. Its procedure does not start.
    const late = await post(endpoint, session, toolCall(4, "test.late"));
    expect(late.status).toBe(200);
    const refusal = messagesOf(await whileAdvancing(clock, late.text())).find((message) => message.id === 4);
    expect(refusal?.result).toMatchObject({ isError: true, _meta: { code: "UNAVAILABLE", retryable: true } });
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
    await advanceUntil(clock, stop.exited);
    expect(stop.exited()).toBe(true);
    expect(clock.now() - stop.startedAt).toBeLessThan(DRAIN_CAP_MS / 2);
    await holding.body?.cancel().catch(() => undefined);
  }, 20000);
});
