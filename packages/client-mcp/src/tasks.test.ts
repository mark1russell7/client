/**
 * MCP tasks (CLI-35): a procedure with `metadata.taskSupport` runs as a task when the host has a
 * task store and the client asks for a task. The tests use the client of the MCP SDK over the
 * in-memory transport, and over Streamable HTTP for the principal of the fair share (CLI-69).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, CreateTaskResultSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { createProcedure, defineModule, type AnyProcedure, type Clock, type ProcedureContext } from "@procedures/client";
import { createMcpHost, type McpHost, type McpHostOptions } from "./host.js";
import { MCP_TASK_LIMITS, McpTaskStore, mcpTaskShareKey, type McpTaskCaller, type McpTaskShareContext } from "./tasks.js";

const NONE = { reads: [], writes: [] };

/** A gate that a test opens: a procedure waits for it. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/** What the procedures of the tests saw: the abort of the long call. */
interface Seen {
  aborted: boolean;
  started: number;
}

function taskModule(seen: Seen, held: Promise<void>) {
  const procedure = <O>(path: string[], output: z.ZodType<O>, handler: (input: Record<string, unknown>, ctx: ProcedureContext) => Promise<O>, meta: Record<string, unknown> = {}) =>
    createProcedure()
      .path(path)
      .input(z.object({}).passthrough())
      .output(output)
      .meta({ description: path.join(" "), effects: NONE, ...meta })
      .handler(handler as never)
      .build() as AnyProcedure;
  return defineModule("task-test", [
    procedure(
      ["crawl", "site"],
      z.object({ pages: z.number(), asked: z.boolean() }),
      async (_input, ctx) => {
        for (let page = 1; page <= 3; page++) await ctx.progress?.({ progress: page, total: 3, message: `page ${page}` });
        return { pages: 3, asked: ctx.elicit !== undefined };
      },
      { taskSupport: "optional" }
    ),
    procedure(
      ["crawl", "wait"],
      z.object({ aborted: z.boolean() }),
      async (_input, ctx) => {
        seen.started++;
        await new Promise<void>((resolve) => {
          void held.then(resolve);
          if (ctx.signal?.aborted) resolve();
          ctx.signal?.addEventListener("abort", () => resolve(), { once: true });
        });
        seen.aborted = ctx.signal?.aborted === true;
        return { aborted: seen.aborted };
      },
      { taskSupport: "optional" }
    ),
    procedure(
      ["crawl", "stubborn"],
      z.object({ done: z.boolean() }),
      async () => {
        // This procedure does not read its signal: it ends only when the test opens the gate
        seen.started++;
        await held;
        return { done: true };
      },
      { taskSupport: "optional" }
    ),
    procedure(["crawl", "all"], z.object({ ok: z.boolean() }), async () => ({ ok: true }), { taskSupport: "required" }),
    procedure(["crawl", "fetch"], z.object({ ok: z.boolean() }), async () => ({ ok: true })),
  ]);
}

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  cleanups = [];
});

async function start(host: Partial<McpHostOptions> = { tasks: {} }) {
  const seen: Seen = { aborted: false, started: 0 };
  const held = gate();
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const mcpHost = createMcpHost({ modules: [taskModule(seen, held.wait)], faces: { sdk: serverSide }, ...host });
  await mcpHost.start();
  const client = new McpClient({ name: "test", version: "0" }, { capabilities: { elicitation: {} } });
  await client.connect(clientSide);
  cleanups.push(async () => {
    held.open();
    await client.close();
    await mcpHost.stop();
  });
  return { client, host: mcpHost, seen, held };
}

/** This function starts a tool call as a task, and gives the task. */
async function startTask(client: McpClient, name: string, ttl?: number) {
  const created = await client.request({ method: "tools/call", params: { name, arguments: {}, task: ttl === undefined ? {} : { ttl } } }, CreateTaskResultSchema);
  return created.task;
}

async function until(check: () => boolean): Promise<void> {
  for (let tries = 0; tries < 200 && !check(); tries++) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(check()).toBe(true);
}

describe("the tools of a host with tasks", () => {
  it("lists the task support of each tool and the tasks capability", async () => {
    const { client } = await start();
    const { tools } = await client.listTools();
    const crawl = tools.filter((tool) => tool.name.startsWith("crawl."));
    const support = Object.fromEntries(crawl.map((tool) => [tool.name, tool.execution?.taskSupport ?? null]));
    expect(support).toEqual({ "crawl.site": "optional", "crawl.wait": "optional", "crawl.stubborn": "optional", "crawl.all": "required", "crawl.fetch": null });
    expect(client.getServerCapabilities()?.tasks).toMatchObject({ list: {}, cancel: {}, requests: { tools: { call: {} } } });
  });

  it("without tasks: the list says nothing of tasks, and each tool is a normal request", async () => {
    const { client, host } = await start({});
    expect(host.tasks).toBeUndefined();
    expect(client.getServerCapabilities()?.tasks).toBeUndefined();
    const { tools } = await client.listTools();
    expect(tools.every((tool) => tool.execution === undefined)).toBe(true);
    const all = await client.callTool({ name: "crawl.all", arguments: {} });
    expect(all.structuredContent).toEqual({ ok: true });
  });
});

describe("a tool call as a task", () => {
  it("gives the task at once, then the status of the progress and the result", async () => {
    const { client, host } = await start();
    const created = await startTask(client, "crawl.site", 60_000);
    expect(created.status).toBe("working");
    expect(created.pollInterval).toBe(1000);
    expect(created.ttl).toBe(60_000);
    let task = await client.experimental.tasks.getTask(created.taskId);
    while (task.status === "working") {
      await new Promise((resolve) => setTimeout(resolve, 10));
      task = await client.experimental.tasks.getTask(created.taskId);
    }
    expect(task.status).toBe("completed");
    expect(task.statusMessage).toBe("3 of 3 done");
    const result = await client.experimental.tasks.getTaskResult(created.taskId, CallToolResultSchema);
    // The call of a task cannot ask the person: the procedure gets no elicit
    expect(result.structuredContent).toEqual({ pages: 3, asked: false });
    expect((await client.experimental.tasks.listTasks()).tasks.map((one) => one.taskId)).toContain(created.taskId);
    expect(host.tasks?.running()).toEqual([]);
  });

  it("runs a normal call of an optional tool in the call, with its progress", async () => {
    const { client, host } = await start();
    const progress: number[] = [];
    const result = await client.callTool({ name: "crawl.site", arguments: {} }, undefined, { onprogress: (update) => progress.push(update.progress) });
    expect(result.structuredContent).toEqual({ pages: 3, asked: true });
    expect(progress).toEqual([1, 2, 3]);
    expect((await client.experimental.tasks.listTasks()).tasks).toEqual([]);
    expect(host.tasks?.running()).toEqual([]);
  });

  it("cancels a task: the signal of the procedure aborts, and a second cancel is an error", async () => {
    const { client, host, seen } = await start();
    const created = await startTask(client, "crawl.wait");
    await until(() => seen.started === 1);
    expect(host.tasks?.running()).toMatchObject([{ id: created.taskId, tool: "crawl.wait", status: "working" }]);
    const cancelled = await client.experimental.tasks.cancelTask(created.taskId);
    expect(cancelled.status).toBe("cancelled");
    await until(() => seen.aborted);
    // The slot is free when the procedure returns
    await until(() => host.tasks?.running().length === 0);
    expect((await client.experimental.tasks.getTask(created.taskId)).status).toBe("cancelled");
    await expect(client.experimental.tasks.cancelTask(created.taskId)).rejects.toThrow(/terminal status/);
  });

  it("fails a task above the limit at once, with the reason in its result", async () => {
    const store = new McpTaskStore({ maxRunning: 1 });
    const { client, host, held, seen } = await start({ tasks: { store } });
    expect(host.tasks).toBe(store);
    const first = await startTask(client, "crawl.wait");
    const refused = await startTask(client, "crawl.wait");
    expect(refused.status).toBe("failed");
    const reason = await client.experimental.tasks.getTaskResult(refused.taskId, CallToolResultSchema);
    expect(reason.isError).toBe(true);
    expect(JSON.stringify(reason.content)).toMatch(/its limit/);
    // The refused task did not start its procedure
    await until(() => seen.started === 1);
    held.open();
    await until(() => store.running().length === 0);
    expect((await client.experimental.tasks.getTask(first.taskId)).status).toBe("completed");
    // With the first task done, a new task starts
    const next = await startTask(client, "crawl.site");
    expect(next.status).toBe("working");
  });

  it("refuses a task for a tool without task support, and a normal call of a required tool", async () => {
    const { client } = await start();
    await expect(startTask(client, "crawl.fetch")).rejects.toThrow(/does not run as a task/);
    await expect(client.callTool({ name: "crawl.all", arguments: {} })).rejects.toThrow(/runs only as a task/);
    const all = await startTask(client, "crawl.all");
    let task = await client.experimental.tasks.getTask(all.taskId);
    while (task.status === "working") {
      await new Promise((resolve) => setTimeout(resolve, 10));
      task = await client.experimental.tasks.getTask(all.taskId);
    }
    expect(task.status).toBe("completed");
  });

  it("keeps a task whose work runs past its ttl: the limit and the cancel still apply", async () => {
    // The fake clock moves with real time, so the polls work, and the test moves it past the ttl at once
    vi.useFakeTimers({ shouldAdvanceTime: true });
    cleanups.push(async () => {
      vi.useRealTimers();
    });
    const { client, host, seen } = await start({ tasks: { maxRunning: 1 } });
    const created = await startTask(client, "crawl.wait", 1000);
    expect(created.ttl).toBe(1000);
    await until(() => seen.started === 1);
    await vi.advanceTimersByTimeAsync(5000);
    expect((await client.experimental.tasks.getTask(created.taskId)).status).toBe("working");
    expect((await startTask(client, "crawl.wait")).status).toBe("failed");
    expect((await client.experimental.tasks.cancelTask(created.taskId)).status).toBe("cancelled");
    await until(() => seen.aborted);
    await until(() => host.tasks?.running().length === 0);
  });

  it("gives an error for a task above the total limit of the store, and keeps nothing of it (CLI-51)", async () => {
    const { client } = await start({ tasks: { maxStored: 1 } });
    const first = await startTask(client, "crawl.wait");
    expect(first.status).toBe("working");
    // The task of the first call still runs, so the session has no task that ended to remove
    await expect(startTask(client, "crawl.wait")).rejects.toThrow(/limit of stored tasks/);
    expect((await client.experimental.tasks.listTasks()).tasks.map((task) => task.taskId)).toEqual([first.taskId]);
  });

  it("does not pass the limit when tasks start at the same time", async () => {
    const { client } = await start({ tasks: { maxRunning: 1 } });
    const tasks = await Promise.all([1, 2, 3].map(() => startTask(client, "crawl.wait")));
    expect(tasks.map((task) => task.status).sort()).toEqual(["failed", "failed", "working"]);
  });

  it("keeps the slot of a cancelled task until its work ends", async () => {
    const { client, host, held, seen } = await start({ tasks: { maxRunning: 1 } });
    const created = await startTask(client, "crawl.stubborn");
    await until(() => seen.started === 1);
    await client.experimental.tasks.cancelTask(created.taskId);
    // The procedure still runs: the task is cancelled, but its slot stays taken
    expect(host.tasks?.running()).toMatchObject([{ id: created.taskId, status: "cancelled" }]);
    expect((await startTask(client, "crawl.site")).status).toBe("failed");
    held.open();
    await until(() => host.tasks?.running().length === 0);
    expect((await startTask(client, "crawl.site")).status).toBe("working");
  });

  it("cancels each task that runs when the host stops", async () => {
    const { client, host, seen } = await start({ tasks: { maxRunning: 2 } });
    await startTask(client, "crawl.wait");
    await until(() => seen.started === 1);
    const store = host.tasks!;
    await host.stop();
    await until(() => seen.aborted);
    expect(store.running()).toEqual([]);
  });
});

describe("McpTaskStore", () => {
  const request = { method: "tools/call", params: { name: "crawl.site" } };

  it("removes a task when its ttl passes after the end of its work", async () => {
    vi.useFakeTimers();
    try {
      const store = new McpTaskStore();
      const task = await store.createTask({ ttl: 2000 }, 1, request);
      await store.storeTaskResult(task.taskId, "completed", { content: [] });
      // The work has not settled yet: the task stays
      await vi.advanceTimersByTimeAsync(3000);
      expect(await store.getTask(task.taskId)).not.toBeNull();
      store.settle(task.taskId);
      await vi.advanceTimersByTimeAsync(1999);
      expect(await store.getTask(task.taskId)).not.toBeNull();
      await vi.advanceTimersByTimeAsync(2);
      expect(await store.getTask(task.taskId)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // Audit pass 2 (O55): before, a task without a session was visible to each HTTP session, and a
  // request without a session saw the tasks of each HTTP session
  it("keeps a task without a session apart from the HTTP sessions, both ways", async () => {
    const store = new McpTaskStore();
    const local = await store.createTask({}, 1, request);
    const remote = await store.createTask({}, 2, request, "s1");
    await store.storeTaskResult(local.taskId, "completed", { content: [{ type: "text", text: "local" }] });
    await store.storeTaskResult(remote.taskId, "completed", { content: [] }, "s1");

    // An HTTP session does not find the task of the stdio face: no status, no result, no cancel, no list
    expect(await store.getTask(local.taskId, "s1")).toBeNull();
    await expect(store.getTaskResult(local.taskId, "s1")).rejects.toThrow(/not found/);
    await expect(store.updateTaskStatus(local.taskId, "cancelled", undefined, "s1")).rejects.toThrow(/not found/);
    expect((await store.listTasks(undefined, "s1")).tasks.map((task) => task.taskId)).toEqual([remote.taskId]);

    // A request without a session does not find the task of an HTTP session
    expect(await store.getTask(remote.taskId)).toBeNull();
    await expect(store.getTaskResult(remote.taskId)).rejects.toThrow(/not found/);
    expect((await store.listTasks()).tasks.map((task) => task.taskId)).toEqual([local.taskId]);

    // Each side still reads its own task
    expect(await store.getTaskResult(local.taskId)).toEqual({ content: [{ type: "text", text: "local" }] });
    expect(await store.getTask(remote.taskId, "s1")).not.toBeNull();
    await store.close();
  });

  it("keeps a refused task for 1 minute, whatever ttl the client asks for", async () => {
    const store = new McpTaskStore({ maxRunning: 1 });
    await store.createTask({ ttl: 86_400_000 }, 1, request);
    const refused = await store.createTask({ ttl: 86_400_000 }, 2, request);
    expect(store.refusal(refused.taskId)).toMatch(/its limit/);
    expect(refused.ttl).toBe(MCP_TASK_LIMITS.refusedTtlMs);
    await store.close();
  });

  it("keeps at most 100 tasks for a session: a new task removes the oldest task that ended", async () => {
    const store = new McpTaskStore();
    const ids: string[] = [];
    for (let count = 0; count < MCP_TASK_LIMITS.maxStoredPerSession; count++) {
      const task = await store.createTask({}, count, request, "s1");
      await store.storeTaskResult(task.taskId, "completed", { content: [] }, "s1");
      store.settle(task.taskId);
      ids.push(task.taskId);
    }
    const other = await store.createTask({}, 0, request, "s2");
    // The other session has room of its own: nothing of s1 goes
    expect(await store.getTask(ids[0]!, "s1")).not.toBeNull();
    await store.createTask({}, 100, request, "s1");
    expect(await store.getTask(ids[0]!, "s1")).toBeNull();
    expect(await store.getTask(ids[1]!, "s1")).not.toBeNull();
    expect(await store.getTask(other.taskId, "s2")).not.toBeNull();
    await store.close();
  });

  it("keeps at most 1000 tasks for all the sessions: a new session gets an error, and the store keeps nothing of it (CLI-51)", async () => {
    expect(MCP_TASK_LIMITS.maxStored).toBe(1000);
    // Without the fair share (CLI-69), ten sessions take the whole store
    const store = new McpTaskStore({ reserve: 0 });
    const sessions = MCP_TASK_LIMITS.maxStored / MCP_TASK_LIMITS.maxStoredPerSession;
    const oldest: string[] = [];
    for (let session = 0; session < sessions; session++) {
      for (let count = 0; count < MCP_TASK_LIMITS.maxStoredPerSession; count++) {
        const task = await store.createTask({}, count, request, `s${session}`);
        await store.storeTaskResult(task.taskId, "completed", { content: [] }, `s${session}`);
        store.settle(task.taskId);
        if (count === 0) oldest.push(task.taskId);
      }
    }
    // The store is full, and the new session has no task that ended: its request gets an error
    const refused = await store.createTask({}, 0, request, "new").then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(McpError);
    expect((refused as McpError).message).toMatch(/limit of stored tasks/);
    expect((refused as McpError).code).toBe(ErrorCode.InvalidRequest);
    expect((refused as McpError).data).toEqual({ code: "TASKS_FULL" });
    expect((await store.listTasks(undefined, "new")).tasks).toEqual([]);
    // A session with a task that ended removes its own oldest task, and the tasks of the other sessions stay
    expect((await store.createTask({}, 100, request, "s0")).status).toBe("working");
    expect(await store.getTask(oldest[0]!, "s0")).toBeNull();
    for (let session = 1; session < sessions; session++) expect(await store.getTask(oldest[session]!, `s${session}`)).not.toBeNull();
    await store.close();
  });

  it("counts the tasks that run: with maxStored 2, a third task gets an error until a task ends", async () => {
    const store = new McpTaskStore({ maxStored: 2 });
    const first = await store.createTask({}, 1, request, "s1");
    await store.createTask({}, 2, request, "s2");
    await expect(store.createTask({}, 3, request, "s1")).rejects.toThrow(/limit of stored tasks/);
    await store.storeTaskResult(first.taskId, "completed", { content: [] }, "s1");
    store.settle(first.taskId);
    // The task that ended makes room for a new task of its own session, not of another session
    await expect(store.createTask({}, 4, request, "s3")).rejects.toThrow(/limit of stored tasks/);
    expect((await store.createTask({}, 5, request, "s1")).status).toBe("working");
    expect(await store.getTask(first.taskId, "s1")).toBeNull();
    await store.close();
  });

  it("has no total limit with maxStored: Infinity", async () => {
    const store = new McpTaskStore({ maxStored: Number.POSITIVE_INFINITY });
    for (let session = 0; session < MCP_TASK_LIMITS.maxStored / MCP_TASK_LIMITS.maxStoredPerSession; session++) {
      for (let count = 0; count < MCP_TASK_LIMITS.maxStoredPerSession; count++) {
        const task = await store.createTask({}, count, request, `s${session}`);
        await store.storeTaskResult(task.taskId, "completed", { content: [] }, `s${session}`);
        store.settle(task.taskId);
      }
    }
    expect((await store.createTask({}, 0, request, "new")).status).toBe("working");
    await store.close();
  });

  it("refuses a limit below 1", () => {
    expect(() => new McpTaskStore({ maxRunning: 0 })).toThrow(RangeError);
    expect(() => new McpTaskStore({ maxStored: 0 })).toThrow(RangeError);
    expect(() => new McpTaskStore({ maxStored: 1.5 })).toThrow(RangeError);
    expect(() => new McpTaskStore({ maxStored: Number.POSITIVE_INFINITY })).not.toThrow();
  });

  it("gives an aborted signal for a task that it does not know", () => {
    expect(new McpTaskStore().signal("nothing").aborted).toBe(true);
  });
});

/** A clock that moves only when the test moves it: the tests do not wait for real time. */
function manualClock(): Clock & { advance(ms: number): void } {
  let now = 0;
  const timers = new Set<{ at: number; run: () => void }>();
  return {
    now: () => now,
    after(ms, run) {
      const timer = { at: now + Math.max(0, ms), run };
      timers.add(timer);
      return () => {
        timers.delete(timer);
      };
    },
    advance(ms) {
      now += ms;
      for (const timer of [...timers].sort((first, second) => first.at - second.at)) {
        if (timer.at > now || !timers.has(timer)) continue;
        timers.delete(timer);
        timer.run();
      }
    },
  };
}

describe("the fair share of the task store (CLI-69)", () => {
  const request = { method: "tools/call", params: { name: "crawl.site" } };
  const as = (id: string): McpTaskCaller => ({ principal: { id, via: "test" } });
  const tenSessions = Array.from({ length: 10 }, (_, index) => `a${String(index)}`);

  /** The error of a promise, or undefined when it resolves. */
  const failure = (promise: Promise<unknown>): Promise<unknown> =>
    promise.then(
      () => undefined,
      (error: unknown) => error,
    );

  /** This function expects the error of a store without room: `-32600` with the code `TASKS_FULL`. */
  function expectTasksFull(error: unknown): void {
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(ErrorCode.InvalidRequest);
    expect((error as McpError).data).toEqual({ code: "TASKS_FULL" });
  }

  /** This function creates a task and ends its work, so a new task of its session can replace it. */
  async function ended(store: McpTaskStore, sessionId: string, caller: McpTaskCaller = {}, ttl?: number) {
    const task = await store.createTask(ttl === undefined ? {} : { ttl }, 0, request, sessionId, caller);
    await store.storeTaskResult(task.taskId, "completed", { content: [] }, sessionId);
    store.settle(task.taskId);
    return task;
  }

  /** This function creates tasks of a client in its sessions in turn, until the store refuses one. The tasks do not end. */
  async function flood(store: McpTaskStore, sessions: readonly string[], caller: McpTaskCaller = {}) {
    const created: string[] = [];
    for (let count = 0; count < 100; count++) {
      const error = await failure(store.createTask({}, count, request, sessions[count % sessions.length], caller).then((task) => void created.push(task.taskId)));
      if (error !== undefined) return { created, error };
    }
    return { created, error: undefined };
  }

  it("keeps one client with many sessions from the whole store: a session of another client still gets a task", async () => {
    const store = new McpTaskStore({ maxStored: 20, reserve: 4, maxRunning: 50 });
    // Client a has ten sessions under one principal. Its tasks run, so no task ended that a new task can replace
    const a = await flood(store, tenSessions, as("a"));
    expect(a.created).toHaveLength(16);
    expectTasksFull(a.error);
    expect((a.error as McpError).message).toMatch(/fair share/);
    // A session of client b gets a task, and each task of client a stays
    expect((await store.createTask({}, 0, request, "b0", as("b"))).status).toBe("working");
    const running = new Set(store.running().map((task) => task.id));
    for (const id of a.created) expect(running.has(id)).toBe(true);
    // Client b is below its share: it takes the reserve, and gets the error only when the store is full
    const b = await flood(store, ["b0"], as("b"));
    expect(b.created).toHaveLength(3);
    expectTasksFull(b.error);
    expect((b.error as McpError).message).toMatch(/its limit of stored tasks\./);
    await store.close();
  });

  it("lets one client take the whole store with reserve: 0, as before the fair share", async () => {
    const store = new McpTaskStore({ maxStored: 20, reserve: 0, maxRunning: 50 });
    const a = await flood(store, tenSessions, as("a"));
    expect(a.created).toHaveLength(20);
    expectTasksFull(a.error);
    expectTasksFull(await failure(store.createTask({}, 0, request, "b0", as("b"))));
    await store.close();
  });

  it("replaces the oldest task that ended in the session of a client with its share near the limit", async () => {
    const store = new McpTaskStore({ maxStored: 10, reserve: 2 });
    const first: string[] = [];
    for (let count = 0; count < 8; count++) first.push((await ended(store, "a1", as("a"))).taskId);
    // The store has 2 free slots, its reserve, and client a has 8 tasks, more than its share of 5
    expect((await store.createTask({}, 8, request, "a1", as("a"))).status).toBe("working");
    expect(await store.getTask(first[0]!, "a1")).toBeNull();
    expect(await store.getTask(first[1]!, "a1")).not.toBeNull();
    expect((await store.listTasks(undefined, "a1")).tasks).toHaveLength(8);
    // Another session of client a has no task that ended: its request gets the error
    expectTasksFull(await failure(store.createTask({}, 0, request, "a2", as("a"))));
    // Client b is below its share
    expect((await store.createTask({}, 0, request, "b1", as("b"))).status).toBe("working");
    await store.close();
  });

  it("with the default reserve, the tenth of ten full sessions replaces its own tasks, and a new session still gets a task", async () => {
    const store = new McpTaskStore();
    const ids: string[][] = [];
    for (let session = 0; session < 10; session++) {
      const own: string[] = [];
      for (let count = 0; count < MCP_TASK_LIMITS.maxStoredPerSession; count++) own.push((await ended(store, `s${String(session)}`)).taskId);
      ids.push(own);
    }
    const kept = async (session: number): Promise<number> => {
      let count = 0;
      for (const id of ids[session]!) if (await store.getTask(id, `s${String(session)}`)) count++;
      return count;
    };
    // Each session is a client without a principal. Near the limit the share of each of ten sessions is 1000 / 11
    expect(await kept(0)).toBe(100);
    expect(await kept(8)).toBe(100);
    expect(await kept(9)).toBe(91);
    expect(await store.getTask(ids[9]![8]!, "s9")).toBeNull();
    expect(await store.getTask(ids[9]![9]!, "s9")).not.toBeNull();
    expect((await store.createTask({}, 0, request, "new")).status).toBe("working");
    await store.close();
  });

  it("counts the tasks with one key as one client: the share key is a function of the context", async () => {
    const contexts: McpTaskShareContext[] = [];
    const store = new McpTaskStore({
      maxStored: 20,
      reserve: 4,
      maxRunning: 50,
      // The client is the part of the session id before the dash: a-0, a-1 and a-2 are one client
      shareKey: (context) => {
        contexts.push(context);
        return context.sessionId?.split("-")[0] ?? "local";
      },
    });
    const a = await flood(store, ["a-0", "a-1", "a-2"]);
    expect(a.created).toHaveLength(16);
    expectTasksFull(a.error);
    expect((await store.createTask({}, 0, request, "b-0")).status).toBe("working");
    expect(contexts[0]).toEqual({ sessionId: "a-0", principal: undefined, request });
    await store.close();
  });

  it("gives the default key of the principal, else of the session", () => {
    expect(mcpTaskShareKey({ sessionId: "s1", principal: { id: "mark", via: "x-user" }, request })).toBe("principal:x-user:mark");
    // Each caller with the token of the host has the same principal: the key of the session
    expect(mcpTaskShareKey({ sessionId: "s1", principal: { id: "token", via: "token" }, request })).toBe("session:s1");
    expect(mcpTaskShareKey({ sessionId: "s1", principal: undefined, request })).toBe("session:s1");
    expect(mcpTaskShareKey({ sessionId: undefined, principal: undefined, request })).toBe("local");
  });

  it("refuses a task when the share key throws, and keeps nothing of it", async () => {
    const store = new McpTaskStore({
      shareKey: () => {
        throw new Error("no key");
      },
    });
    const error = await failure(store.createTask({}, 0, request, "s1"));
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(ErrorCode.InternalError);
    expect((await store.listTasks(undefined, "s1")).tasks).toEqual([]);
    await store.close();
  });

  it("refuses a reserve that is not an integer from 0 to half of maxStored", () => {
    expect(() => new McpTaskStore({ reserve: -1 })).toThrow(RangeError);
    expect(() => new McpTaskStore({ reserve: 1.5 })).toThrow(RangeError);
    expect(() => new McpTaskStore({ maxStored: 10, reserve: 6 })).toThrow(RangeError);
    expect(() => new McpTaskStore({ maxStored: 10, reserve: 5 })).not.toThrow();
    expect(() => new McpTaskStore({ maxStored: Number.POSITIVE_INFINITY, reserve: 3 })).not.toThrow();
  });

  it("refuses a client with its share until the time of its tasks ends, on the clock of the store", async () => {
    const clock = manualClock();
    const store = new McpTaskStore({ maxStored: 20, reserve: 4, clock });
    // Client a has 16 tasks that ended, each in a session of its own, with a time of 1 second
    for (let session = 0; session < 16; session++) await ended(store, `a${String(session)}`, as("a"), 1000);
    // A new session of client a has no task that ended to replace: its request gets the error
    expectTasksFull(await failure(store.createTask({}, 0, request, "a16", as("a"))));
    clock.advance(999);
    expectTasksFull(await failure(store.createTask({}, 0, request, "a16", as("a"))));
    clock.advance(1);
    // The time of the tasks ended: the store removed them, and client a gets a task again
    expect((await store.createTask({}, 0, request, "a16", as("a"))).status).toBe("working");
    await store.close();
  });
});

describe("the fair share over Streamable HTTP (CLI-69)", () => {
  /** This function mounts the HTTP face of a host on a listener of the test, on a free port of loopback. */
  async function listenFor(host: McpHost): Promise<URL> {
    const listener = createServer((req, res) => {
      if (host.handleHttp(req, res)) return;
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
    return new URL(`http://127.0.0.1:${String((listener.address() as AddressInfo).port)}/mcp`);
  }

  it("keys each task with the principal of the request hook: one client with three sessions cannot take the store", async () => {
    const seen: Seen = { aborted: false, started: 0 };
    const held = gate();
    const host = createMcpHost({
      modules: [taskModule(seen, held.wait)],
      faces: { http: {} },
      policy: {
        principalOf: (credentials) => {
          const user = credentials.headers?.["x-user"];
          return user ? { principal: { id: user, via: "x-user" } } : undefined;
        },
      },
      tasks: { maxStored: 10, reserve: 2, maxRunning: 20 },
    });
    await host.start();
    cleanups.push(async () => {
      held.open();
      await host.stop();
    });
    const url = await listenFor(host);
    const connectAs = async (user: string): Promise<McpClient> => {
      const client = new McpClient({ name: "test", version: "0" });
      // The SDK types do not agree with exactOptionalPropertyTypes
      await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { "x-user": user } } }) as never);
      cleanups.push(() => client.close());
      return client;
    };
    const sessions = [await connectAs("a"), await connectAs("a"), await connectAs("a")];
    // Each task of client a waits for the gate, so no task ended that a new task can replace
    const created: string[] = [];
    let refused: unknown;
    for (let count = 0; count < 12 && refused === undefined; count++) {
      await startTask(sessions[count % sessions.length]!, "crawl.wait").then(
        (task) => void created.push(task.taskId),
        (error: unknown) => {
          refused = error;
        },
      );
    }
    expect(created).toHaveLength(8);
    expect(refused).toBeInstanceOf(McpError);
    expect((refused as McpError).message).toMatch(/fair share/);
    expect((refused as McpError).data).toEqual({ code: "TASKS_FULL" });
    // A session of client b gets a task that runs
    const other = await connectAs("b");
    expect((await startTask(other, "crawl.wait")).status).toBe("working");
  });
});
