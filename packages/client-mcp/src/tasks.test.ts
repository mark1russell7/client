/**
 * MCP tasks (CLI-35): a procedure with `metadata.taskSupport` runs as a task when the host has a
 * task store and the client asks for a task. The tests use the client of the MCP SDK over the
 * in-memory transport.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, CreateTaskResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createProcedure, defineModule, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { createMcpHost, type McpHostOptions } from "./host.js";
import { MCP_TASK_LIMITS, McpTaskStore } from "./tasks.js";

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

  it("refuses a limit below 1", () => {
    expect(() => new McpTaskStore({ maxRunning: 0 })).toThrow(RangeError);
  });

  it("gives an aborted signal for a task that it does not know", () => {
    expect(new McpTaskStore().signal("nothing").aborted).toBe(true);
  });
});
