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
 *   session and each face of a host. A task without a session (stdio, an SDK transport) is
 *   visible only to the requests without a session, not to an HTTP session.
 * - A slot of the limit (`maxRunning`) stays taken until the work of the task ends, not until its
 *   status ends: a cancelled task holds its slot until its procedure returns. A task above the
 *   limit is created, and then fails at once with the reason: the client gets a task, and reads
 *   the reason in the result of the task. A full store (`maxStored`) is different: it creates no
 *   task, and the request gets the error `-32600` with the code `TASKS_FULL`.
 * - The time to keep a task (`ttl`) starts when the task ends. The store never removes a task
 *   whose work runs, so a short `ttl` does not let work escape the limit or the cancel. A refused
 *   task stays 1 minute. The timers run on the clock of the store (`clock`).
 * - Each session keeps at most 100 tasks, and the store keeps at most `maxStored` tasks for all
 *   the sessions together: 1000 by default (CLI-51). A new task removes the oldest task of its
 *   own session that ended. When the store is full and the session has no task that ended, the
 *   request of the new task gets an error, and the store keeps nothing of it. Thus a client
 *   cannot remove the results of another session. `Infinity` turns the total limit off.
 * - The fair share (CLI-69) keeps one client from the whole store. Refer to `McpTaskStore`.
 * - A cancel of a task (`tasks/cancel`) aborts the signal of its procedure call. The close of a
 *   session cancels its tasks, and the stop of the host cancels each task.
 *
 * The SDK marks its task API as experimental, so this part follows the SDK when it changes.
 */

import { randomUUID } from "node:crypto";
import type { CreateTaskOptions, TaskStore } from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import { ErrorCode, McpError, type Request, type RequestId, type Result, type Task } from "@modelcontextprotocol/sdk/types.js";
import { optionalMs, realClock, type Cancel, type Clock, type Duration, type Principal } from "@procedures/client";

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
  /** A refused task and its reason stay for this time: 1 minute. */
  refusedTtlMs: 60_000,
  /** The most tasks that the store keeps for one session. A new task removes the oldest task of its session that ended. */
  maxStoredPerSession: 100,
  /**
   * The most tasks that the store keeps for all the sessions together (CLI-51): ten sessions with
   * their most tasks. Without it, only the session limit times 100 bounds the store.
   */
  maxStored: 1_000,
  /**
   * The part of `maxStored` that the fair share keeps for the clients below their share (CLI-69):
   * a tenth, rounded down. Thus the default `reserve` is 100 slots of 1000.
   */
  reserveDivisor: 10,
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

/** What the key of the fair share reads to find the client of a new task (CLI-69). */
export interface McpTaskShareContext {
  /** The session of the request. It is undefined for a face without sessions: stdio, or an SDK transport. */
  readonly sessionId: string | undefined;
  /** The principal of the request, when the handler of the face gives it before the call (`identify`). */
  readonly principal: Principal | undefined;
  /** The request of the task: its method and its params. */
  readonly request: Request;
}

/** What a face knows of the caller of a new task (CLI-69): the fifth argument of `createTask`. */
export interface McpTaskCaller {
  /** The principal of the request, from `identify` of the handler of the face. */
  readonly principal?: Principal | undefined;
}

/**
 * The default key of the fair share (CLI-69): the principal of the request, else the session.
 * Each caller with the token of the host gets the same principal (`via: "token"`). That principal
 * does not identify one client, so such a request gets the key of its session. A request without
 * a session (stdio, an SDK transport) gets the key `local`.
 */
export function mcpTaskShareKey(context: McpTaskShareContext): string {
  const { principal, sessionId } = context;
  if (principal !== undefined && principal.via !== "token") return `principal:${principal.via}:${principal.id}`;
  return sessionId !== undefined ? `session:${sessionId}` : "local";
}

/** The options of a task store. */
export interface McpTaskStoreOptions {
  /** The most tasks whose work runs at one time. The default is 8. */
  readonly maxRunning?: number | undefined;
  /**
   * The most tasks that the store keeps for all the sessions together, also the tasks that ended
   * (CLI-51). The default is 1000. A new task above the limit gets an error. `Infinity` turns the
   * limit off.
   */
  readonly maxStored?: number | undefined;
  /**
   * The last free slots of the store, which only a client below its fair share can take (CLI-69).
   * The default is a tenth of `maxStored`, rounded down: 100 of 1000. The value is an integer
   * from 0 to half of `maxStored`. `0` turns the fair share off.
   */
  readonly reserve?: number | undefined;
  /**
   * This function gives the key of the client of a new task, for the fair share (CLI-69). The
   * tasks with one key count as the tasks of one client. The default is `mcpTaskShareKey`: the
   * principal of the request, else the session.
   */
  readonly shareKey?: ((context: McpTaskShareContext) => string) | undefined;
  /** The time that a task and its result stay after the task ends, when the client asks for no time. The default is 1 hour. */
  readonly ttl?: Duration | undefined;
  /** The clock of the timers that remove the tasks. The default is the clock of the platform. A test gives a fake clock. */
  readonly clock?: Clock | undefined;
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
  readonly sessionId: string | undefined;
  /** The key of the client of the task, for the fair share (CLI-69). */
  readonly key: string;
  readonly tool: string;
  readonly controller: AbortController;
  /** The reason that the task does not start: the store has its most tasks. The task then fails at once. */
  readonly refused: string | undefined;
  result?: Result;
  /** True when the work of the task ended: its slot is free. */
  settled: boolean;
  /** This function stops the timer that removes the task. */
  cancel?: Cancel | undefined;
}

const TERMINAL = new Set<Task["status"]>(["completed", "failed", "cancelled"]);

/** True for a limit: an integer of 1 or more, or no limit (`Infinity`). */
function isLimit(value: number): boolean {
  return value === Number.POSITIVE_INFINITY || (Number.isInteger(value) && value >= 1);
}

/**
 * The store of the tasks of an MCP host. It keeps an abort signal for each task, so a cancel of
 * the task aborts the work of its procedure.
 *
 * The fair share (CLI-69) keeps one client from the whole store. The key of a task
 * (`shareKey`) tells its client: by default the principal of the request, else the session.
 * These are the rules for a new task of a key:
 *
 * - The share of the key is `maxStored / (k + 1)`. `k` is the number of keys that have tasks in
 *   the store, the new key included. The `+ 1` keeps a share for the client that comes next.
 * - When `reserve` slots or fewer are free, a key with its share or more does not get more tasks.
 *   Its new task replaces the oldest task of its session that ended. Without such a task, the
 *   request gets the error `TASKS_FULL`, as for a full store.
 * - A key below its share gets a task while the store has a free slot.
 *
 * Thus one key keeps at most `maxStored - reserve` tasks, because `reserve` is at most half of
 * `maxStored`. One client with many sessions under one principal cannot take the whole store. A
 * session of another client gets a task while the reserve has a free slot. The total limit
 * (`maxStored`) and the limit of 100 tasks of a session stay as they are.
 */
export class McpTaskStore implements TaskStore {
  private readonly entries = new Map<string, Entry>();
  private readonly maxRunning: number;
  private readonly maxStored: number;
  private readonly reserve: number;
  private readonly ttlMs: number;
  private readonly clock: Clock;
  private readonly shareKey: (context: McpTaskShareContext) => string;
  private closed = false;

  constructor(private readonly options: McpTaskStoreOptions = {}) {
    const maxRunning = options.maxRunning ?? MCP_TASK_LIMITS.maxRunning;
    if (!Number.isInteger(maxRunning) || maxRunning < 1) throw new RangeError(`maxRunning must be an integer of 1 or more, not ${String(maxRunning)}`);
    this.maxRunning = maxRunning;
    const maxStored = options.maxStored ?? MCP_TASK_LIMITS.maxStored;
    if (!isLimit(maxStored)) throw new RangeError(`maxStored must be an integer of 1 or more, or Infinity, not ${String(maxStored)}`);
    this.maxStored = maxStored;
    // Without a total limit the store is never full, so the fair share has nothing to keep
    const finite = maxStored !== Number.POSITIVE_INFINITY;
    const reserve = options.reserve ?? (finite ? Math.floor(maxStored / MCP_TASK_LIMITS.reserveDivisor) : 0);
    if (!Number.isInteger(reserve) || reserve < 0 || (finite && reserve > Math.floor(maxStored / 2))) {
      throw new RangeError(`reserve must be an integer from 0 to half of maxStored, not ${String(reserve)}`);
    }
    this.reserve = finite ? reserve : 0;
    this.ttlMs = optionalMs(options.ttl, "ttl") ?? MCP_TASK_LIMITS.ttlMs;
    this.clock = options.clock ?? realClock;
    this.shareKey = options.shareKey ?? mcpTaskShareKey;
  }

  private changed(): void {
    try {
      this.options.onChange?.();
    } catch {
      // A listener writes a status file, for example: its error does not stop a task
    }
  }

  /**
   * The entry of a task, when the session may see it: a task of another session is not found. A
   * task without a session (stdio, an SDK transport) is visible only to a request without a
   * session, and a request without a session does not see the tasks of the HTTP sessions.
   */
  private lookup(taskId: string, sessionId: string | undefined): Entry | undefined {
    const entry = this.entries.get(taskId);
    if (entry && entry.sessionId !== sessionId) return undefined;
    return entry;
  }

  private found(taskId: string, sessionId: string | undefined): Entry {
    const entry = this.lookup(taskId, sessionId);
    if (!entry) throw new Error(`Task with ID ${taskId} not found`);
    return entry;
  }

  /** This method removes a task and stops its timer. */
  private remove(entry: Entry): void {
    entry.cancel?.();
    entry.cancel = undefined;
    this.entries.delete(entry.task.taskId);
  }

  /** The time to keep a task starts when it ends, and the store removes it only when its work also ended. */
  private expire(entry: Entry): void {
    entry.cancel?.();
    entry.cancel = undefined;
    if (!TERMINAL.has(entry.task.status) || !entry.settled || this.closed) return;
    const ttl = entry.task.ttl ?? this.ttlMs;
    const cancel = this.clock.after(ttl, () => {
      if (this.entries.get(entry.task.taskId) === entry) this.entries.delete(entry.task.taskId);
    });
    // The timer of a task does not keep the process alive
    cancel.unref?.();
    entry.cancel = cancel;
  }

  /** The key of the client of a new task. An error of the function, or a key that is not a string, refuses the task. */
  private keyOf(context: McpTaskShareContext): string {
    let key: unknown;
    try {
      key = this.shareKey(context);
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `The share key of the task store failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof key !== "string") throw new McpError(ErrorCode.InternalError, "The share key of the task store gave no string");
    return key;
  }

  /** The tasks of a key, and the number of keys that have tasks, the key included. */
  private holding(key: string): { held: number; keys: number } {
    const keys = new Set<string>([key]);
    let held = 0;
    for (const entry of this.entries.values()) {
      keys.add(entry.key);
      if (entry.key === key) held++;
    }
    return { held, keys: keys.size };
  }

  /**
   * True when a new task of the key must replace a task of its session: the store is full, or
   * `reserve` slots or fewer are free and the key has its fair share or more (CLI-69).
   */
  private mustReplace(key: string): boolean {
    const size = this.entries.size;
    if (size >= this.maxStored) return true;
    if (this.reserve === 0 || size < this.maxStored - this.reserve) return false;
    const { held, keys } = this.holding(key);
    // The share is maxStored / (keys + 1): the + 1 keeps a share for the client that comes next
    return held * (keys + 1) >= this.maxStored;
  }

  /**
   * This method removes the oldest tasks of a session that ended. It removes one task for a
   * replacement (`replace`), and enough tasks to keep the session below its limit of 100. It
   * removes only the tasks of the same session, so a client cannot remove the results of another
   * session. A task whose work runs stays: the limit of the running tasks bounds them. The method
   * gives the number of tasks that it removed.
   */
  private makeRoom(sessionId: string | undefined, replace: boolean): number {
    const own = [...this.entries.values()].filter((entry) => entry.sessionId === sessionId);
    let excess = Math.max(own.length + 1 - MCP_TASK_LIMITS.maxStoredPerSession, this.entries.size + 1 - this.maxStored, replace ? 1 : 0);
    let removed = 0;
    for (const entry of own) {
      if (excess <= 0) break;
      if (!entry.settled || !TERMINAL.has(entry.task.status)) continue;
      this.remove(entry);
      excess--;
      removed++;
    }
    return removed;
  }

  /** The count of the tasks whose work runs. */
  private runningCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) if (!entry.settled) count++;
    return count;
  }

  /** The error of a request that the store refuses: the store is full, or the client has its fair share near the limit. */
  private full(key: string): McpError {
    const size = this.entries.size;
    const reason =
      size >= this.maxStored
        ? `The host stores ${String(size)} tasks, its limit of stored tasks.`
        : `The host stores ${String(size)} tasks, near its limit of stored tasks (${String(this.maxStored)}), and this client has its fair share of them (${String(this.holding(key).held)} tasks).`;
    return new McpError(ErrorCode.InvalidRequest, `${reason} Try again when the time of a task ends.`, { code: "TASKS_FULL" });
  }

  /**
   * The store counts and inserts a task in one step, so a batch of requests cannot pass the limits.
   * When the store has no room after `makeRoom`, the request gets an error and the store keeps
   * nothing. The fifth argument tells the caller (CLI-69): the face gives the principal of the
   * request, for the key of the fair share.
   */
  async createTask(params: CreateTaskOptions, _requestId: RequestId, request: Request, sessionId?: string, caller: McpTaskCaller = {}): Promise<Task> {
    if (this.closed) throw new McpError(ErrorCode.InvalidRequest, "The MCP host is stopping: it starts no task");
    const key = this.keyOf({ sessionId, principal: caller.principal, request });
    const replace = this.mustReplace(key);
    const removed = this.makeRoom(sessionId, replace);
    if (this.entries.size >= this.maxStored || (replace && removed === 0)) throw this.full(key);
    const running = this.runningCount();
    const refused =
      running >= this.maxRunning ? `The host runs ${String(running)} tasks, its limit. Wait for a task to end, or cancel one.` : undefined;
    const asked = params.ttl ?? this.ttlMs;
    const createdAt = new Date().toISOString();
    const task: Task = {
      taskId: randomUUID(),
      status: "working",
      ttl: refused !== undefined ? MCP_TASK_LIMITS.refusedTtlMs : Math.min(Math.max(MCP_TASK_LIMITS.minTtlMs, asked), MCP_TASK_LIMITS.maxTtlMs),
      createdAt,
      lastUpdatedAt: createdAt,
      pollInterval: params.pollInterval ?? MCP_TASK_LIMITS.pollMs,
    };
    const name = (request.params as { name?: unknown } | undefined)?.name;
    this.entries.set(task.taskId, {
      task,
      sessionId,
      key,
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
    for (const entry of this.entries.values()) entry.cancel?.();
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
