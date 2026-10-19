/**
 * MCP tasks (CLI-35): the long-running task primitive of the MCP specification 2025-11-25.
 *
 * A client starts a long tool call as a task: it gets a task id at once, polls the status, gets
 * the result later, and can cancel the task. A procedure declares that its tool can run as a task
 * with `metadata.taskSupport` (`"optional"` or `"required"`). The MCP host gives the store of the
 * tasks (`tasks` of `createMcpHost`). Without that option the host has no tasks, and each tool
 * call is a normal request.
 *
 * - The store keeps the tasks in memory. It wraps the `InMemoryTaskStore` of the SDK, which binds
 *   each task to its session. One store serves each session and each face of a host.
 * - The store has a limit of tasks that run at one time. A task above the limit is created, and
 *   then fails at once with the reason. The SDK 1.32.1 cannot give an error for a task request,
 *   so the client reads the reason in the result of the task.
 * - A cancel of a task (`tasks/cancel`) aborts the signal of its procedure call. The close of a
 *   session cancels its tasks, and the stop of the host cancels each task.
 *
 * The SDK marks its task API as experimental, so this part follows the SDK when it changes.
 */

import { InMemoryTaskStore } from "@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js";
import type { CreateTaskOptions, TaskStore } from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import { ErrorCode, McpError, type Request, type RequestId, type Result, type Task } from "@modelcontextprotocol/sdk/types.js";
import { optionalMs, type Duration } from "@procedures/client";

/** The limits of the tasks of one MCP host. */
export const MCP_TASK_LIMITS = {
  /** A task and its result stay for this time after the task starts: 1 hour by default. */
  ttlMs: 3_600_000,
  /** The longest time that a client can ask for: 1 day. */
  maxTtlMs: 86_400_000,
  /** The shortest time that a client can ask for: 1 second. */
  minTtlMs: 1_000,
  /** The time that the server proposes between two polls of the status: 1 second. */
  pollMs: 1_000,
  /** The most tasks that run at one time. A new task above the limit fails at once. */
  maxRunning: 8,
} as const;

/** A task that did not end, as a status page of the host shows it. */
export interface McpTaskInfo {
  /** The task id that the client got. */
  readonly id: string;
  /** The name of the tool, for example `crawl.site`. */
  readonly tool: string;
  /** `working` or `input_required`. */
  readonly status: string;
  /** The text of the progress, for example `3 of 10 done`, or null. */
  readonly message: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The options of a task store. */
export interface McpTaskStoreOptions {
  /** The most tasks that run at one time. The default is 8. */
  readonly maxRunning?: number | undefined;
  /** The time that a task and its result stay, when the client asks for no time. The default is 1 hour. */
  readonly ttl?: Duration | undefined;
  /** This function runs when a task starts, changes its status or ends. An error of it does not stop a task. */
  readonly onChange?: (() => void) | undefined;
}

/** The tasks of an MCP host (`tasks` of `createMcpHost`): a store, or the options of a new store. */
export interface McpTasksOptions extends McpTaskStoreOptions {
  /** The store of the tasks. Without it, the host makes a store with the other options. */
  readonly store?: McpTaskStore | undefined;
}

interface Job {
  readonly controller: AbortController;
  readonly tool: string;
  readonly sessionId: string | undefined;
  /** The reason that the task does not start: the store has its most tasks. The task then fails at once. */
  readonly refused: string | undefined;
  done: boolean;
}

/**
 * The store of the tasks of an MCP host. It keeps an abort signal for each task, so a cancel of
 * the task aborts the work of its procedure.
 */
export class McpTaskStore implements TaskStore {
  private readonly store = new InMemoryTaskStore();
  private readonly jobs = new Map<string, Job>();
  private readonly maxRunning: number;
  private readonly ttlMs: number;
  private closed = false;

  constructor(private readonly options: McpTaskStoreOptions = {}) {
    const maxRunning = options.maxRunning ?? MCP_TASK_LIMITS.maxRunning;
    if (!Number.isInteger(maxRunning) || maxRunning < 1) throw new RangeError(`maxRunning must be an integer of 1 or more, not ${String(maxRunning)}`);
    this.maxRunning = maxRunning;
    this.ttlMs = optionalMs(options.ttl, "ttl") ?? MCP_TASK_LIMITS.ttlMs;
  }

  private changed(): void {
    try {
      this.options.onChange?.();
    } catch {
      // A listener writes a status file, for example: its error does not stop a task
    }
  }

  /** This method removes the jobs whose tasks the SDK store removed at the end of their time. */
  private prune(): void {
    const live = new Set(this.store.getAllTasks().map((task) => task.taskId));
    for (const id of this.jobs.keys()) if (!live.has(id)) this.jobs.delete(id);
  }

  async createTask(params: CreateTaskOptions, requestId: RequestId, request: Request, sessionId?: string): Promise<Task> {
    if (this.closed) throw new McpError(ErrorCode.InvalidRequest, "The MCP host is stopping: it starts no task");
    this.prune();
    // A task above the limit fails at once: the SDK cannot give an error for a task request
    const running = [...this.jobs.values()].filter((job) => !job.done).length;
    const refused =
      running >= this.maxRunning ? `The host runs ${String(running)} tasks, its limit. Wait for a task to end, or cancel one.` : undefined;
    const asked = params.ttl ?? this.ttlMs;
    const ttl = Math.min(Math.max(MCP_TASK_LIMITS.minTtlMs, asked), MCP_TASK_LIMITS.maxTtlMs);
    const task = await this.store.createTask({ ...params, ttl, pollInterval: params.pollInterval ?? MCP_TASK_LIMITS.pollMs }, requestId, request, sessionId);
    const name = (request.params as { name?: unknown } | undefined)?.name;
    this.jobs.set(task.taskId, {
      controller: new AbortController(),
      tool: typeof name === "string" ? name : request.method,
      sessionId,
      refused,
      done: false,
    });
    this.changed();
    return task;
  }

  getTask(taskId: string, sessionId?: string): Promise<Task | null> {
    return this.store.getTask(taskId, sessionId);
  }

  async storeTaskResult(taskId: string, status: "completed" | "failed", result: Result, sessionId?: string): Promise<void> {
    await this.store.storeTaskResult(taskId, status, result, sessionId);
    const job = this.jobs.get(taskId);
    if (job !== undefined) job.done = true;
    this.changed();
  }

  getTaskResult(taskId: string, sessionId?: string): Promise<Result> {
    return this.store.getTaskResult(taskId, sessionId);
  }

  async updateTaskStatus(taskId: string, status: Task["status"], statusMessage?: string, sessionId?: string): Promise<void> {
    await this.store.updateTaskStatus(taskId, status, statusMessage, sessionId);
    const job = this.jobs.get(taskId);
    if (job !== undefined && (status === "completed" || status === "failed" || status === "cancelled")) {
      job.done = true;
      // A cancel aborts the work of the procedure: its requests in progress stop
      if (status === "cancelled") job.controller.abort(new Error("The client cancelled the task"));
    }
    this.changed();
  }

  listTasks(cursor?: string, sessionId?: string): Promise<{ tasks: Task[]; nextCursor?: string }> {
    return this.store.listTasks(cursor, sessionId);
  }

  /** The abort signal of a task. A cancel of the task aborts it. An unknown task gives an aborted signal. */
  signal(taskId: string): AbortSignal {
    return this.jobs.get(taskId)?.controller.signal ?? AbortSignal.abort(new Error("The task is not known"));
  }

  /** The reason that a task did not start, or undefined for a task that started. */
  refusal(taskId: string): string | undefined {
    return this.jobs.get(taskId)?.refused;
  }

  /** The tasks that did not end, the oldest first. */
  running(): McpTaskInfo[] {
    const tasks = new Map(this.store.getAllTasks().map((task) => [task.taskId, task]));
    const infos: McpTaskInfo[] = [];
    for (const [id, job] of this.jobs) {
      const task = tasks.get(id);
      if (job.done || task === undefined) continue;
      infos.push({ id, tool: job.tool, status: task.status, message: task.statusMessage ?? null, createdAt: task.createdAt, updatedAt: task.lastUpdatedAt });
    }
    return infos;
  }

  /** The sessions that have a task in progress. The session limit of the HTTP face keeps them open. */
  busySessions(): Set<string> {
    const busy = new Set<string>();
    for (const job of this.jobs.values()) if (!job.done && job.sessionId !== undefined) busy.add(job.sessionId);
    return busy;
  }

  /** This method cancels the tasks of a session that closed. Their work stops. */
  async cancelSession(sessionId: string, message = "The session of the task closed"): Promise<void> {
    for (const [id, job] of this.jobs) {
      if (job.done || job.sessionId !== sessionId) continue;
      await this.updateTaskStatus(id, "cancelled", message, sessionId).catch(() => undefined);
    }
  }

  /** This method cancels each task that runs and removes all the tasks. A second close does nothing. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const [id, job] of this.jobs) {
      if (job.done) continue;
      await this.updateTaskStatus(id, "cancelled", "The MCP host stopped", job.sessionId).catch(() => undefined);
    }
    this.store.cleanup();
    this.jobs.clear();
  }
}

/** The task store of an option: the given store, or a new store. `owned` is true for a new store. */
export function taskStoreOf(options: McpTasksOptions | undefined): { store: McpTaskStore; owned: boolean } | undefined {
  if (options === undefined) return undefined;
  if (options.store) return { store: options.store, owned: false };
  return { store: new McpTaskStore(options), owned: true };
}
