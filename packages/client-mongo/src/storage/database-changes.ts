/**
 * One change watcher for a whole database (roadmap CLI-88). `watchDatabaseChanges()` opens the
 * change stream of the database, and gives each raw change event to `onChange`. After an error, it
 * opens the stream again from the resume token of the last change that `onChange` took.
 *
 * - The event goes to `onChange` as the driver gives it: `fullDocument`, `fullDocumentBeforeChange`
 *   (the image before the change), `ns`, `clusterTime`, `wallTime` and each other field. Set
 *   `fullDocumentBeforeChange` to get the image. A collection gives it only with
 *   `changeStreamPreAndPostImages` (MongoDB 6 or later).
 * - The events go one at a time, in the order of the stream. The watcher reads the next event
 *   after `onChange` resolves.
 * - The resume token is the `_id` of the last event, after its `onChange` resolved. A batch without
 *   events gives the token of the batch (the post-batch resume token). `resumeToken` of the handle
 *   gives the token at this time.
 * - A stream that fails before its first event keeps the first token of its open. The next stream
 *   starts at that token, so a change after `ready` is not lost.
 * - After an error of the stream, the watcher waits for the backoff. Then it opens the stream again
 *   with `startAfter` and the token. Thus it loses no change and gives no change twice.
 * - An error of `onChange` has the same backoff. The token stays at the change before, so the same
 *   change comes again.
 * - The backoff starts at `initialDelay` and grows by `backoffMultiplier` to at most `maxDelay`,
 *   with `jitter`. A change or a batch without events sets it back to `initialDelay`.
 * - Some errors do not go away. The watcher then stops, and the error goes to `onError` and to the
 *   logger:
 *   - An `invalidate` event (for example after `dropDatabase`). `resumeToken` is then the token of
 *     that event: a new watcher with `startAfter` starts after it.
 *   - A token that the server does not know any more (codes 260, 280 and 286, for example
 *     `ChangeStreamHistoryLost`).
 *   - Before the first open: a refused access, a single server (code 40573), a wrong option.
 * - `stop()` or an abort of `signal` stops the watcher. It closes the stream and cancels the timer
 *   of the backoff. An `onChange` that runs finishes, and no change comes after it.
 * - Change streams need a replica set or a sharded cluster. The watcher asks the server (`hello`)
 *   before the first open: on a single server, it stops with the code 40573.
 * - An event over the BSON limit of 16 MiB comes in fragments. The pipeline ends with the stage
 *   `$changeStreamSplitLargeEvent`, and the watcher joins the fragments into one event. A server
 *   before 6.0.9 does not know the stage. The watcher then opens the stream without it.
 * - An error with one code at one token, 5 times in a row, does not go away: the watcher stops. An
 *   example is an event over the BSON limit (code 10334) with no split stage. A network error and an
 *   error that the driver resumes do not count.
 */
import type { ChangeStream, ChangeStreamDocument, ChangeStreamOptions, Db, Document, ResumeToken, Timestamp } from "mongodb";
import { realClock, writeLog, type Cancel, type Clock, type LogFields, type Logger, type ResubscribeBackoff } from "@procedures/client";
import { tokenAge } from "./token-age.js";
import { COMMAND_NOT_FOUND, LOST_TOKEN_CODES, backoffOf, codeOf, isPermanent, messageOf } from "./storage-hints.js";
import { SAME_TOKEN_LIMIT, SPLIT_LARGE_EVENT_STAGE, UNKNOWN_STAGE_CODE, eventJoiner, sameTokenFaults } from "./split-events.js";

/** The options of `watchDatabaseChanges()`. */
export interface WatchDatabaseChangesOptions<TChange extends Document = ChangeStreamDocument> {
  /**
   * The function that gets each raw change event, one at a time. The watcher keeps the token of
   * the event after the function resolves. When it fails, the same event comes again after the backoff.
   */
  onChange: (change: TChange) => void | Promise<void>;
  /**
   * The function that gets the error that stops the watcher. The error is an `invalidate` event, a
   * lost resume token, or an error of the first open that does not go away. An error with one code at
   * one token 5 times in a row also stops the watcher. An `invalidate` event gives an `Error` with the event in its field
   * `change`. The error of a fault at one token has the fields `code`, `resumeToken` and `cause`.
   */
  onError?: ((error: unknown) => void) | undefined;
  /** The resume token after which the first stream starts. Give only one of `resumeAfter`, `startAfter` and `startAtOperationTime`. */
  resumeAfter?: ResumeToken | undefined;
  /** The resume token after which the first stream starts, also the token of an `invalidate` event. */
  startAfter?: ResumeToken | undefined;
  /** The time of the cluster at which the first stream starts. */
  startAtOperationTime?: Timestamp | undefined;
  /** The `fullDocument` option of the stream: `updateLookup`, `whenAvailable` or `required`. */
  fullDocument?: "updateLookup" | "whenAvailable" | "required" | undefined;
  /** The `fullDocumentBeforeChange` option of the stream: `whenAvailable`, `required` or `off`. */
  fullDocumentBeforeChange?: "whenAvailable" | "required" | "off" | undefined;
  /** The pipeline of the stream, for example a `$match` of the collections. @default [] */
  pipeline?: Document[] | undefined;
  /**
   * True to add the stage `$changeStreamSplitLargeEvent` after the pipeline. The watcher then joins
   * the fragments of an event over 16 MiB. With false, such an event stops the watcher.
   * @default true
   */
  splitLargeEvents?: boolean | undefined;
  /** More options of the stream, for example `maxAwaitTimeMS`, `batchSize` or `showExpandedEvents`. */
  streamOptions?: Omit<ChangeStreamOptions, "resumeAfter" | "startAfter" | "startAtOperationTime" | "fullDocument" | "fullDocumentBeforeChange"> | undefined;
  /**
   * The backoff before the stream opens again after an error.
   * @default { initialDelay: ms(250), maxDelay: seconds(30), backoffMultiplier: 2, jitter: 1 }
   */
  backoff?: ResubscribeBackoff | undefined;
  /**
   * The logger of the watcher. The fields of each line hold its context: `database`, `collection`,
   * `operationType`, `resumeToken` (true when the watcher has a token), `error`, `attempt` and `delayMs`.
   * @default the console, with the prefix `[database-changes]`
   */
  logger?: Logger | undefined;
  /** The signal that stops the watcher. */
  signal?: AbortSignal | undefined;
  /** The clock of the timers (default the clock of the platform). The timers do not keep a process alive. */
  clock?: Clock | undefined;
}

/** The handle of `watchDatabaseChanges()`. */
export interface DatabaseChangesWatch {
  /**
   * It resolves when the first stream is open (each later change reaches `onChange`), or when the
   * watcher stops. It rejects when the watcher stops on an error before the first open.
   */
  readonly ready: Promise<void>;
  /** The resume token of the last change that `onChange` took, or of the last batch without events. It is undefined before the first open without a start token. */
  readonly resumeToken: ResumeToken | undefined;
  /** True after `stop()`, an abort of `signal`, or an error that stops the watcher. */
  readonly stopped: boolean;
  /**
   * The milliseconds of `clock` since `resumeToken` last moved to a later cluster time, or since the start before the first move.
   * The same cluster time again does not move it. A large value on an open watcher tells a stalled feed (roadmap CLI-110).
   */
  readonly tokenAgeMs: number;
  /** This method stops the watcher: it closes the stream and cancels the timer of a backoff. */
  stop(): Promise<void>;
}

/** An error of `onChange`: the watcher waits, and gives the same change again. */
class HandlerError extends Error {
  readonly error: unknown;
  readonly change: Document;

  constructor(
    error: unknown,
    change: Document
  ) {
    super(`onChange failed: ${messageOf(error)}`);
    this.error = error;
    this.change = change;
  }
}

/** The collection of a change event, from its `ns`. */
function collectionOf(change: Document): unknown {
  const ns: unknown = change["ns"];
  return typeof ns === "object" && ns !== null ? (ns as Document)["coll"] : undefined;
}

/**
 * This function watches the change stream of a whole database, and gives each raw change event to
 * `onChange` (roadmap CLI-88). After an error, it opens the stream again from the resume token,
 * after a bounded backoff. Refer to the module comment for the rules.
 *
 * @param db - The database, or a function that gives it
 * @param options - The handlers, the start of the stream, its options, the backoff, the logger and the signal
 * @returns The handle: `ready`, `resumeToken`, `stopped`, `tokenAgeMs` and `stop()`
 *
 * @example
 * ```typescript
 * const watch = watchDatabaseChanges(db, {
 *   fullDocument: "updateLookup",
 *   fullDocumentBeforeChange: "whenAvailable",
 *   resumeAfter: savedToken,
 *   onChange: async (change) => {
 *     await apply(change);
 *     savedToken = change._id;
 *   },
 *   onError: (error) => console.error("the watcher stopped", error),
 *   logger,
 * });
 * await watch.ready;
 * // ...
 * await watch.stop();
 * ```
 */
export function watchDatabaseChanges<TChange extends Document = ChangeStreamDocument>(
  db: Db | (() => Db | Promise<Db>),
  options: WatchDatabaseChangesOptions<TChange>
): DatabaseChangesWatch {
  if (typeof options?.onChange !== "function") throw new TypeError("onChange must be a function");
  const starts = [options.resumeAfter, options.startAfter, options.startAtOperationTime].filter((value) => value !== undefined);
  if (starts.length > 1) throw new TypeError("give only one of resumeAfter, startAfter and startAtOperationTime");
  const delayOf = backoffOf(options.backoff);
  const clock = options.clock ?? realClock;
  const logger = options.logger;
  const dbOf = typeof db === "function" ? db : (): Db => db;

  let stopped = false;
  /** The token of the last change that `onChange` took, or of the last batch without events. */
  let token: ResumeToken | undefined = options.startAfter ?? options.resumeAfter;
  const age = tokenAge(clock, token);
  /** True after a stream was open. */
  let opened = false;
  /** True after the server said that it has change streams. */
  let checked = false;
  /** The tries since the last success. The backoff gives the delay of the next try from it. */
  let attempt = 0;
  let database: string | undefined;
  let stream: ChangeStream<Document, TChange> | undefined;
  /**
   * The first token of the open stream, and true after the stream gives its first event. A fault before
   * the first event, with no other token, opens the next stream at this token, so no change is lost.
   */
  let openToken: ResumeToken | undefined;
  let gaveEvent = false;
  /** True while the pipeline ends with the split stage. A server that does not know the stage sets it to false. */
  let split = options.splitLargeEvents !== false;
  const faults = sameTokenFaults();
  /** The timer of a backoff, and the end of its wait. */
  let timer: Cancel | undefined;
  let wake: (() => void) | undefined;
  let markReady: () => void = () => undefined;
  let failReady: (error: unknown) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    markReady = resolve;
    failReady = reject;
  });
  // A caller that does not wait for `ready` gets no unhandled rejection: the logger tells the error
  ready.catch(() => undefined);

  const log = (level: "info" | "warn" | "error", message: string, fields: LogFields): void => {
    const all = { component: "database-changes", database, resumeToken: token !== undefined, ...fields };
    writeLog(logger, level, message, all, `[database-changes] ${message}`, all);
  };

  /** The end of the watcher after an error that does not go away. */
  const fail = (error: unknown, fields: LogFields): void => {
    if (stopped) return;
    log("error", "The change stream stopped: the error does not go away", { error, ...fields });
    halt();
    failReady(error);
    try {
      options.onError?.(error);
    } catch (thrown) {
      log("error", "onError failed", { error: thrown });
    }
  };

  /** The wait of the backoff. `stop()` ends it. */
  const backoff = (message: string, fields: LogFields): Promise<void> => {
    const delay = delayOf(attempt);
    attempt++;
    log("warn", message, { ...fields, attempt, delayMs: Math.round(delay) });
    return new Promise<void>((resolve) => {
      wake = resolve;
      timer = clock.after(delay, () => {
        timer = undefined;
        wake = undefined;
        resolve();
      });
      timer.unref?.();
    });
  };

  /** The start of the next stream: after the token, else the start of the options. */
  const start = (): Pick<ChangeStreamOptions, "resumeAfter" | "startAfter" | "startAtOperationTime"> => {
    if (!opened && options.resumeAfter !== undefined) return { resumeAfter: options.resumeAfter };
    if (token !== undefined) return { startAfter: token };
    return options.startAtOperationTime !== undefined ? { startAtOperationTime: options.startAtOperationTime } : {};
  };

  /** The stream is open: the next change reaches `onChange`. */
  const markOpen = (): void => {
    if (opened || stopped) return;
    opened = true;
    markReady();
  };

  /** A success: a batch without events, or a change that `onChange` took. The backoff starts again. */
  const succeeded = (): void => {
    if (attempt > 0) log("info", "The change stream opened again", { attempts: attempt });
    attempt = 0;
  };

  /** One stream: it reads the events until an error, an `invalidate` event or the stop. */
  const read = async (next: ChangeStream<Document, TChange>): Promise<void> => {
    const joiner = eventJoiner();
    for (;;) {
      const raw = await next.tryNext();
      if (stopped) return;
      markOpen();
      if (raw !== null) gaveEvent = true;
      if (raw === null) {
        // A batch without events: its token is after each event that `onChange` took. In the middle of a split event, the token stays before it
        const batchToken = next.resumeToken;
        if (!joiner.partial && batchToken !== undefined && batchToken !== null) {
          token = batchToken;
          age.note(token);
        }
        succeeded();
        continue;
      }
      const result = joiner.push(raw);
      if (result.kind === "part") continue;
      if (result.kind === "missing") {
        log("warn", "A split event comes without its first fragments: the stream started after one of them", { missing: result.missing, collection: collectionOf(result.change) });
      }
      const change = result.change as TChange;
      if (change["operationType"] === "invalidate") {
        token = change["_id"];
        age.note(token);
        return fail(Object.assign(new Error(`the change stream of the database ${database ?? ""} was invalidated`), { change }), { operationType: "invalidate" });
      }
      try {
        await options.onChange(change);
      } catch (error) {
        throw new HandlerError(error, change);
      }
      token = change["_id"];
      age.note(token);
      faults.reset();
      succeeded();
    }
  };

  const run = async (): Promise<void> => {
    while (!stopped) {
      let handle: Db;
      try {
        handle = await dbOf();
        database = handle.databaseName;
        if (!checked) {
          // On a single server, the driver can wait without an error: the watcher asks the server first
          let hello: Document | undefined;
          try {
            hello = await handle.command({ hello: 1 });
          } catch (error) {
            // An old server without hello: the stream tells the error
            if (codeOf(error) !== COMMAND_NOT_FOUND) throw error;
          }
          if (hello && typeof hello["setName"] !== "string" && hello["msg"] !== "isdbgrid") {
            const single = Object.assign(new Error("change streams need a replica set or a sharded cluster, and the server is a single server"), { code: 40573 });
            return fail(single, { code: 40573 });
          }
          checked = true;
        }
      } catch (error) {
        if (stopped) return;
        if (!opened && isPermanent(error)) return fail(error, { code: codeOf(error) });
        await backoff("The database is not available: the change stream opens again after a backoff", { error, code: codeOf(error) });
        continue;
      }
      if (stopped) return;
      if (token === undefined && opened) log("warn", "The change stream opens again without a resume token: it can miss changes", {});
      try {
        const pipeline = [...(options.pipeline ?? []), ...(split ? [SPLIT_LARGE_EVENT_STAGE] : [])];
        const next = handle.watch<Document, TChange>(pipeline, {
          ...options.streamOptions,
          ...(options.fullDocument !== undefined && { fullDocument: options.fullDocument }),
          ...(options.fullDocumentBeforeChange !== undefined && { fullDocumentBeforeChange: options.fullDocumentBeforeChange }),
          ...start(),
        });
        stream = next;
        openToken = undefined;
        gaveEvent = false;
        // The first token of the stream comes with the answer of the server: the stream is open, before the first getMore
        next.on("resumeTokenChanged", markOpen);
        // The driver also gives the token of each event before onChange takes it, so only a token before the first event is kept
        next.once("resumeTokenChanged", (first: ResumeToken | null | undefined) => {
          if (!gaveEvent && first !== null && first !== undefined) openToken = first;
        });
        try {
          await read(next);
        } finally {
          if (stream === next) stream = undefined;
          await next.close().catch(() => undefined);
        }
      } catch (error) {
        if (stopped) return;
        if (error instanceof HandlerError) {
          await backoff("onChange failed: the same change comes again after a backoff", {
            error: error.error,
            collection: collectionOf(error.change),
            operationType: error.change["operationType"],
          });
          continue;
        }
        // A fault before the first event of a stream with no token: the next stream starts at the first token of this stream (CLI-107)
        if (token === undefined && !gaveEvent && openToken !== undefined) {
          token = openToken;
          // The server gave this token, so it moves the age as each other token of the watcher does (CLI-110)
          age.note(token);
        }
        const code = codeOf(error);
        if (code !== undefined && LOST_TOKEN_CODES.has(code)) return fail(error, { code });
        if (code === UNKNOWN_STAGE_CODE && split) {
          // A server before 6.0.9: the stream opens again without the split stage
          split = false;
          log("warn", "The server does not know the stage $changeStreamSplitLargeEvent: an event over 16 MiB stops the watcher", { error, code });
          continue;
        }
        if (!opened && isPermanent(error)) return fail(error, { code });
        const repeats = faults.count(error, token);
        if (repeats >= SAME_TOKEN_LIMIT) {
          const stuck = Object.assign(new Error(`the change stream failed ${repeats} times at one token with the code ${String(code)}: ${messageOf(error)}`), { code, resumeToken: token, cause: error });
          return fail(stuck, { code, repeats });
        }
        await backoff("The change stream failed: it opens again after a backoff", { error, code });
      }
    }
  };

  /** The end of the watcher: no new stream, no timer. */
  const halt = (): void => {
    stopped = true;
    timer?.();
    timer = undefined;
    wake?.();
    wake = undefined;
    options.signal?.removeEventListener("abort", onAbort);
  };

  const stop = async (): Promise<void> => {
    if (stopped) return;
    halt();
    markReady();
    const current = stream;
    stream = undefined;
    await current?.close().catch(() => undefined);
  };

  const onAbort = (): void => void stop();

  if (options.signal?.aborted) {
    stopped = true;
    markReady();
  } else {
    options.signal?.addEventListener("abort", onAbort, { once: true });
    void run().catch((error: unknown) => fail(error, {}));
  }

  return {
    ready,
    get resumeToken(): ResumeToken | undefined {
      return token;
    },
    get stopped(): boolean {
      return stopped;
    },
    get tokenAgeMs(): number {
      return age.ageMs();
    },
    stop,
  };
}
