/**
 * This file has the handles: the objects with a state of a caller (d40-handles, kind 5 of direction 40).
 *
 * A SQLite database, a service, a stream or a page of a browser is not JSON. A procedure that opens
 * such an object keeps it in the handle scope of its caller, and gives a handle: `{ "handle": "<id>" }`.
 * Other procedures take the handle and get the object. The face of a host gives one scope to each
 * owner: an MCP session, a connection, or a caller in the process. The end of the owner closes each
 * object of its scope, so a session that ends leaves no open database.
 */

import type { JsonSchema } from "./schema.js";

/** The JSON form of a handle: the id of an object in the handle scope of its owner. */
export interface HandleRef {
  readonly handle: string;
}

/**
 * The keyword of the JSON Schema of a handle. Its value is the kind of the object, for example
 * `"sqlite.Database"`. A generator reads it to find the inputs and the outputs that are handles.
 */
export const HANDLE_KEYWORD = "x-procedures-handle" as const;

/** The default count limit of the open objects of one scope. */
export const DEFAULT_MAX_HANDLES = 64;

/** This function gives the JSON Schema of a handle of a kind. */
export function handleSchema(kind: string): JsonSchema {
  return {
    type: "object",
    description: `A handle of a ${kind}. The procedure that opens it gives it, and handle.close closes it.`,
    properties: { handle: { type: "string", minLength: 1 } },
    required: ["handle"],
    additionalProperties: false,
    [HANDLE_KEYWORD]: kind,
  };
}

/** This function tells if a value has the JSON form of a handle. */
export function isHandleRef(value: unknown): value is HandleRef {
  return typeof value === "object" && value !== null && typeof (value as { handle?: unknown }).handle === "string";
}

/** One open object of a scope, as `handle.list` gives it. */
export interface HandleInfo {
  /** The id of the handle. */
  readonly handle: string;
  /** The kind of the object, for example `"sqlite.Database"`. */
  readonly kind: string;
  /** A short text that tells the object apart, for example the path of a file. */
  readonly label?: string;
  /** The time of the open, in milliseconds since the epoch. */
  readonly openedAt: number;
  /** The time of the last use: the open, or the last `get`. */
  readonly usedAt: number;
}

/** The options of `HandleScope.open`. */
export interface HandleOpenOptions<T> {
  /**
   * The function that closes the object. Without it, the scope uses the first of these that the
   * object has: `Symbol.asyncDispose`, `Symbol.dispose` and a `close()` method.
   */
  readonly close?: ((value: T) => unknown) | undefined;
  /** A short text that tells the object apart in `handle.list`, for example the path of a file. */
  readonly label?: string | undefined;
}

/** The options of a scope. */
export interface HandleScopeOptions {
  /** The most open objects at one time. The default is `DEFAULT_MAX_HANDLES`. */
  readonly maxHandles?: number | undefined;
  /**
   * The idle time limit of an object, in milliseconds. An object that no call used for this time
   * closes at the next operation of the scope. The default is no limit.
   */
  readonly idleMs?: number | undefined;
  /** The clock of the times, in milliseconds since the epoch. The default is `Date.now`. */
  readonly now?: (() => number) | undefined;
}

/** One object that did not close at the end of a scope. */
export interface HandleCloseFailure {
  readonly handle: string;
  readonly kind: string;
  readonly error: unknown;
}

/** The result of the end of a scope. */
export interface HandleEndReport {
  /** The count of the objects that closed. */
  readonly closed: number;
  /** The objects whose close function failed. The scope removed them too. */
  readonly failed: readonly HandleCloseFailure[];
}

/**
 * The error of a handle operation. Its `code` is a code of the protocol, so each face gives it to
 * the caller:
 *
 * - `VALIDATION_ERROR`: the handle is not open in this scope, or it has a different kind.
 * - `RATE_LIMITED`: the scope has `maxHandles` open objects. A close of one lets the next open succeed.
 * - `NOT_ACCEPTABLE`: the face of the call keeps no handles, or its scope ended.
 */
export class HandleError extends Error {
  override readonly name = "HandleError";
  readonly code: "VALIDATION_ERROR" | "RATE_LIMITED" | "NOT_ACCEPTABLE";
  readonly retryable = false;

  constructor(code: HandleError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

interface Entry {
  readonly kind: string;
  readonly value: unknown;
  readonly close: (() => unknown) | undefined;
  readonly label: string | undefined;
  readonly openedAt: number;
  usedAt: number;
}

/** This function gives the close function of an object that the open gives no close function for. */
function defaultClose(value: unknown): (() => unknown) | undefined {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return undefined;
  const record = value as Record<PropertyKey, unknown>;
  const symbols = Symbol as unknown as { asyncDispose?: symbol; dispose?: symbol };
  for (const key of [symbols.asyncDispose, symbols.dispose, "close"]) {
    if (key === undefined) continue;
    const method = record[key];
    if (typeof method === "function") return () => (method as () => unknown).call(value);
  }
  return undefined;
}

/** This function gives an id with 128 random bits. */
function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `h_${hex}`;
}

/** This function gives the id of a handle or of its JSON form. */
function idOf(ref: HandleRef | string): string {
  return typeof ref === "string" ? ref : ref.handle;
}

/**
 * The open objects of one owner. A handle resolves only in the scope that opened it, so the caller
 * of another scope cannot use it. The ids have 128 random bits.
 *
 * ```ts
 * const scope = new HandleScope();
 * const ref = scope.open("sqlite.Database", openDatabase(path), { label: path });
 * const db = scope.get<Database>(ref, "sqlite.Database");
 * await scope.end(); // closes each object that is still open
 * ```
 */
export class HandleScope {
  private readonly entries = new Map<string, Entry>();
  private readonly maxHandles: number;
  private readonly idleMs: number | undefined;
  private readonly now: () => number;
  private endedFlag = false;

  constructor(options: HandleScopeOptions = {}) {
    this.maxHandles = options.maxHandles ?? DEFAULT_MAX_HANDLES;
    this.idleMs = options.idleMs;
    this.now = options.now ?? Date.now;
  }

  /** The count of the open objects. */
  get size(): number {
    return this.entries.size;
  }

  /** True after `end()`: the scope opens no more objects. */
  get ended(): boolean {
    return this.endedFlag;
  }

  /**
   * This method keeps an object in the scope and gives its handle. It refuses the open when the
   * scope has `maxHandles` open objects, or when the scope ended. Then the caller still owns the object.
   */
  open<T>(kind: string, value: T, options: HandleOpenOptions<T> = {}): HandleRef {
    if (this.endedFlag) throw new HandleError("NOT_ACCEPTABLE", `The handle scope ended, so it cannot keep a ${kind}.`);
    this.closeIdle();
    if (this.entries.size >= this.maxHandles) {
      throw new HandleError(
        "RATE_LIMITED",
        `The handle scope has ${String(this.maxHandles)} open objects, its limit. Close a handle with handle.close, and then open the ${kind}.`,
      );
    }
    const close = options.close;
    const at = this.now();
    const id = randomId();
    this.entries.set(id, {
      kind,
      value,
      close: close !== undefined ? () => close(value) : defaultClose(value),
      label: options.label,
      openedAt: at,
      usedAt: at,
    });
    return { handle: id };
  }

  /**
   * This method gives the object of a handle. With a kind, it refuses an object of a different
   * kind. It refuses a handle that is not open in this scope: a closed handle, or a handle of another scope.
   */
  get<T = unknown>(ref: HandleRef | string, kind?: string): T {
    this.closeIdle();
    const id = idOf(ref);
    const entry = this.entries.get(id);
    if (entry === undefined) {
      throw new HandleError("VALIDATION_ERROR", `The handle ${id} is not open for this caller. handle.list gives the open handles.`);
    }
    if (kind !== undefined && entry.kind !== kind) {
      throw new HandleError("VALIDATION_ERROR", `The handle ${id} is a ${entry.kind}, not a ${kind}.`);
    }
    entry.usedAt = this.now();
    return entry.value as T;
  }

  /** This method tells if a handle is open in this scope. */
  has(ref: HandleRef | string): boolean {
    return this.entries.has(idOf(ref));
  }

  /** This method gives the open objects, in the order of their open. */
  list(): HandleInfo[] {
    this.closeIdle();
    return [...this.entries].map(([handle, entry]) => ({
      handle,
      kind: entry.kind,
      ...(entry.label !== undefined ? { label: entry.label } : {}),
      openedAt: entry.openedAt,
      usedAt: entry.usedAt,
    }));
  }

  /**
   * This method removes a handle and closes its object. It gives false for a handle that is not
   * open. When the close function fails, the handle is removed, and the method throws the error.
   */
  async close(ref: HandleRef | string): Promise<boolean> {
    const id = idOf(ref);
    const entry = this.entries.get(id);
    if (entry === undefined) return false;
    this.entries.delete(id);
    await entry.close?.();
    return true;
  }

  /**
   * This method ends the scope: it opens no more objects, and it closes each open object, the
   * last open first. A close function that fails does not stop the others. The report gives it.
   */
  async end(): Promise<HandleEndReport> {
    this.endedFlag = true;
    const entries = [...this.entries].reverse();
    this.entries.clear();
    let closed = 0;
    const failed: HandleCloseFailure[] = [];
    for (const [handle, entry] of entries) {
      try {
        await entry.close?.();
        closed += 1;
      } catch (error) {
        failed.push({ handle, kind: entry.kind, error });
      }
    }
    return { closed, failed };
  }

  /** This method closes each object that no call used for the idle time limit. A failed close is ignored. */
  private closeIdle(): void {
    if (this.idleMs === undefined) return;
    const limit = this.now() - this.idleMs;
    for (const [id, entry] of this.entries) {
      if (entry.usedAt > limit) continue;
      this.entries.delete(id);
      void Promise.resolve()
        .then(() => entry.close?.())
        .catch(() => undefined);
    }
  }
}

/**
 * This function closes an object as a scope closes it: with `Symbol.asyncDispose`, `Symbol.dispose`
 * or a `close()` method. It does nothing for a value that has none of them. A caller uses it when
 * `open` refuses an object, because then the caller still owns the object.
 */
export async function closeValue(value: unknown): Promise<void> {
  await defaultClose(value)?.();
}

/**
 * This function gives the handle scope of a call, or throws `NOT_ACCEPTABLE` when the face of the
 * call keeps no handles.
 */
export function handleScopeOf(ctx: { handles?: HandleScope | undefined } | undefined): HandleScope {
  const scope = ctx?.handles;
  if (scope === undefined) {
    throw new HandleError(
      "NOT_ACCEPTABLE",
      "The face of this call keeps no handles. An MCP session, a connection or a scope in the process keeps them.",
    );
  }
  return scope;
}
