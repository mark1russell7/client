/**
 * MCP tasks (CLI-35): the long-running task primitive of the MCP specification 2025-11-25.
 *
 * A client starts a long tool call as a task: it gets a task id at once, polls the status, gets
 * the result later, and can cancel the task. A procedure declares that its tool can run as a task
 * with `metadata.taskSupport` (`"optional"` or `"required"`). The MCP host gives the store of the
 * tasks (`tasks` of `createMcpHost`). Without that option the host has no tasks, and each tool
 * call is a normal request.
 *
 * - The store keeps the tasks in memory and binds each task to its session. One store serves each
 *   session and each face of a host.
 * - A slot of the limit (`maxRunning`) stays taken until the work of the task ends, not until its
 *   status ends: a cancelled task holds its slot until its procedure returns. A task above the
 *   limit is created, and then fails at once with the reason. The SDK 1.32.1 cannot give an error
 *   for a task request, so the client reads the reason in the result of the task.
 * - The time to keep a task (`ttl`) starts when the task ends. The store never removes a task
 *   whose work runs, so a short `ttl` does not let work escape the limit or the cancel.
 * - A cancel of a task (`tasks/cancel`) aborts the signal of its procedure call. The close of a
 *   session cancels its tasks, and the stop of the host cancels each task.
 *
 * The SDK marks its task API as experimental, so this part follows the SDK when it changes.
 */

import { randomUUID } from "node:crypto";
import type { CreateTaskOptions, TaskStore } from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import { ErrorCode, McpError, type Request, type RequestId, type Result, type Task } from "@modelcontextprotocol/sdk/types.js";
import { optionalMs, type Duration } from "@procedures/client";

/** The limits of the tasks of one MCP host. */
export const MCP_TASK_LIMITS = {
  /** A task and its result stay for this time after the task ends: 1 hour by default. */
  ttlMs: 3_600_000,
  /** The longest time that a client can ask for: 1 day. */
  maxTtlMs: 86_400_000,
  /** The shortest time that a client can ask for: 1 second. */
  minTtlMs: 1_000,
  /** The time that the server proposes between two polls of the status: 1 second. */
  pollMs: 1_000,
  /** The most tasks whose work runs at one time. A new task above the limit fails at once. */
  maxRunning: 8,
  /** The tasks on one page of `tasks/list`. */
  pageSize: 10,
} as const;

/** A task whose work did not end, as a status page of the host shows it. */
export interface McpTaskInfo {
  /** The task id that the client got. */
  readonly id: string;
  /** The name of the tool, for example `crawl.site`. */
  readonly tool: string;
  /** `working`, `input_required`, or `cancelled` while the procedure stops. */
  readonly status: string;
  /** The text of the progress, for example `3 of 10 done`, or null. */
  readonly message: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The options of a task store. */
export interface McpTaskStoreOptions {
  /** The most tasks whose work runs at one time. The default is 8. */
  readonly maxRunning?: number | undefined;
  /** The time that a task and its result stay after the task ends, when the client asks for no time. The default is 1 hour. */
  readonly ttl?: Duration | undefined;
  /** This function runs when a task starts, changes its status or ends. An error of it does not stop a task. */
  readonly onChange?: (() => void) | undefined;
}

/** The tasks of an MCP host (`tasks` of `createMcpHost`): a store, or the options of a new store. */
export interface McpTasksOptions extends McpTaskStoreOptions {
  /** The store of the tasks. Without it, the host makes a store with the other options. */
  readonly store?: McpTaskStore | undefined;
}

interface Entry {
  readonly task: Task;
  readonly request: Request;
  readonly requestId: RequestId;
  readonly sessionId: string | undefined;
  readonly tool: string;
  readonly controller: AbortController;
  /** The reason that the task does not start: the store has its most tasks. The task then fails at once. */
  readonly refused: string | undefined;
  result?: Result;
  /** True when the work of the task ended: its slot is free. */
  settled: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

const TERMINAL = new Set<Task["status"]>(["completed", "failed", "cancelled"]);

/**
 * The store of the tasks of an MCP host. It keeps an abort signal for each task, so a cancel of
 * the task aborts the work of its procedure.
 */
export class McpTaskStore implements TaskStore {
  private readonly entries = new Map<string, Entry>();
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

  /** The entry of a task, when the session may see it: a task of another session is not found. */
  private lookup(taskId: string, sessionId: string | undefined): Entry | undefined {
    const entry = this.entries.get(taskId);
    if (entry && sessionId !== undefined && entry.sessionId !== undefined && entry.sessionId !== sessionId) return undefined;
    return entry;
  }

  private found(taskId: string, sessionId: string | undefined): Entry {
    const entry = this.lookup(taskId, sessionId);
    if (!entry) throw new Error(`Task with ID ${taskId} not found`);
    return entry;
  }

  /** The time to keep a task starts when it ends, and the store removes it only when its work also ended. */
  private expire(entry: Entry): void {
    if (entry.timer) clearTimeout(entry.timer);
    if (!TERMINAL.has(entry.task.status) || !entry.settled || this.closed) return;
    const ttl = entry.task.ttl ?? this.ttlMs;
    entry.timer = setTimeout(() => {
      this.entries.delete(entry.task.taskId);
    }, ttl);
    entry.timer.unref?.();
  }

  /** The count of the tasks whose work runs. */
  private runningCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) if (!entry.settled) count++;
    return count;
  }

  /** The store counts and inserts a task in one step, so a batch of requests cannot pass the limit. */
  async createTask(params: CreateTaskOptions, requestId: RequestId, request: Request, sessionId?: string): Promise<Task> {
    if (this.closed) throw new McpError(ErrorCode.InvalidRequest, "The MCP host is stopping: it starts no task");
    const running = this.runningCount();
    const refused =
      running >= this.maxRunning ? `The host runs ${String(running)} tasks, its limit. Wait for a task to end, or cancel one.` : undefined;
    const asked = params.ttl ?? this.ttlMs;
    const createdAt = new Date().toISOString();
    const task: Task = {
      taskId: randomUUID(),
      status: "working",
      ttl: Math.min(Math.max(MCP_TASK_LIMITS.minTtlMs, asked), MCP_TASK_LIMITS.maxTtlMs),
      createdAt,
      lastUpdatedAt: createdAt,
      pollInterval: params.pollInterval ?? MCP_TASK_LIMITS.pollMs,
    };
    const name = (request.params as { name?: unknown } | undefined)?.name;
    this.entries.set(task.taskId, {
      task,
      request,
      requestId,
      sessionId,
      tool: typeof name === "string" ? name : request.method,
      controller: new AbortController(),
      refused,
      // A refused task never starts its work, so it takes no slot
      settled: refused !== undefined,
    });
    this.changed();
    return { ...task };
  }

  async getTask(taskId: string, sessionId?: string): Promise<Task | null> {
    const entry = this.lookup(taskId, sessionId);
    return entry ? { ...entry.task } : null;
  }

  async storeTaskResult(taskId: string, status: "completed" | "failed", result: Result, sessionId?: string): Promise<void> {
    const entry = this.found(taskId, sessionId);
    if (TERMINAL.has(entry.task.status)) {
      throw new Error(`Cannot store result for task ${taskId} in terminal status '${entry.task.status}'. Task results can only be stored once.`);
    }
    entry.result = result;
    entry.task.status = status;
    entry.task.lastUpdatedAt = new Date().toISOString();
    this.expire(entry);
    this.changed();
  }

  async getTaskResult(taskId: string, sessionId?: string): Promise<Result> {
    const entry = this.found(taskId, sessionId);
    if (!entry.result) throw new Error(`Task ${taskId} has no result stored`);
    return entry.result;
  }

  async updateTaskStatus(taskId: string, status: Task["status"], statusMessage?: string, sessionId?: string): Promise<void> {
    const entry = this.found(taskId, sessionId);
    if (TERMINAL.has(entry.task.status)) {
      throw new Error(
        `Cannot update task ${taskId} from terminal status '${entry.task.status}' to '${status}'. Terminal states (completed, failed, cancelled) cannot transition to other states.`
      );
    }
    entry.task.status = status;
    if (statusMessage) entry.task.statusMessage = statusMessage;
    entry.task.lastUpdatedAt = new Date().toISOString();
    // A cancel aborts the work of the procedure: its requests in progress stop
    if (status === "cancelled") entry.controller.abort(new Error("The client cancelled the task"));
    this.expire(entry);
    this.changed();
  }

  async listTasks(cursor?: string, sessionId?: string): Promise<{ tasks: Task[]; nextCursor?: string }> {
    const ids = [...this.entries.keys()].filter((id) => this.lookup(id, sessionId) !== undefined);
    let start = 0;
    if (cursor) {
      const index = ids.indexOf(cursor);
      if (index < 0) throw new Error(`Invalid cursor: ${cursor}`);
      start = index + 1;
    }
    const page = ids.slice(start, start + MCP_TASK_LIMITS.pageSize);
    const tasks = page.map((id) => ({ ...this.entries.get(id)!.task }));
    return start + MCP_TASK_LIMITS.pageSize < ids.length ? { tasks, nextCursor: page[page.length - 1]! } : { tasks };
  }

  /**
   * This method tells the store that the work of a task ended: the procedure returned or threw.
   * Its slot is free, and the time to keep the task starts when the task also has an end status.
   */
  settle(taskId: string): void {
    const entry = this.entries.get(taskId);
    if (!entry || entry.settled) return;
    entry.settled = true;
    this.expire(entry);
    this.changed();
  }

  /** The abort signal of a task. A cancel of the task aborts it. An unknown task gives an aborted signal. */
  signal(taskId: string): AbortSignal {
    return this.entries.get(taskId)?.controller.signal ?? AbortSignal.abort(new Error("The task is not known"));
  }

  /** The reason that a task did not start, or undefined for a task that started. */
  refusal(taskId: string): string | undefined {
    return this.entries.get(taskId)?.refused;
  }

  /** The tasks whose work did not end, the oldest first. */
  running(): McpTaskInfo[] {
    const infos: McpTaskInfo[] = [];
    for (const [id, entry] of this.entries) {
      if (entry.settled) continue;
      const { task } = entry;
      infos.push({ id, tool: entry.tool, status: task.status, message: task.statusMessage ?? null, createdAt: task.createdAt, updatedAt: task.lastUpdatedAt });
    }
    return infos;
  }

  /** The sessions that have a task whose work runs. The session limit of the HTTP face keeps them open. */
  busySessions(): Set<string> {
    const busy = new Set<string>();
    for (const entry of this.entries.values()) if (!entry.settled && entry.sessionId !== undefined) busy.add(entry.sessionId);
    return busy;
  }

  /** This method cancels the tasks of a session that closed. Their work stops. */
  async cancelSession(sessionId: string, message = "The session of the task closed"): Promise<void> {
    for (const [id, entry] of this.entries) {
      if (entry.sessionId !== sessionId || TERMINAL.has(entry.task.status)) continue;
      await this.updateTaskStatus(id, "cancelled", message, sessionId).catch(() => undefined);
    }
  }

  /** This method cancels each task that runs and removes all the tasks and their timers. A second close does nothing. */
  async close(): Promise<void> {
    if (this.closed) return;
    for (const [id, entry] of this.entries) {
      if (TERMINAL.has(entry.task.status)) continue;
      await this.updateTaskStatus(id, "cancelled", "The MCP host stopped", entry.sessionId).catch(() => undefined);
    }
    this.closed = true;
    for (const entry of this.entries.values()) if (entry.timer) clearTimeout(entry.timer);
    this.entries.clear();
    this.changed();
  }
}

/** The task store of an option: the given store, or a new store. `owned` is true for a new store. */
export function taskStoreOf(options: McpTasksOptions | undefined): { store: McpTaskStore; owned: boolean } | undefined {
  if (options === undefined) return undefined;
  if (options.store) return { store: options.store, owned: false };
  return { store: new McpTaskStore(options), owned: true };
}
