/**
 * MCP tasks (CLI-35): a procedure with `metadata.taskSupport` runs as a task when the host has a
 * task store and the client asks for a task. The tests use the client of the MCP SDK over the
 * in-memory transport.
 */

import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, CreateTaskResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createProcedure, defineModule, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { createMcpHost, type McpHostOptions } from "./host.js";
import { McpTaskStore } from "./tasks.js";

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
    expect(support).toEqual({ "crawl.site": "optional", "crawl.wait": "optional", "crawl.all": "required", "crawl.fetch": null });
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
    expect(host.tasks?.running()).toEqual([]);
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
  it("refuses a limit below 1", () => {
    expect(() => new McpTaskStore({ maxRunning: 0 })).toThrow(RangeError);
  });

  it("gives an aborted signal for a task that it does not know", () => {
    expect(new McpTaskStore().signal("nothing").aborted).toBe(true);
  });
});
