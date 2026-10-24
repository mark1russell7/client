/**
 * The writer of an NDJSON stream response (wire protocol v1, `documentation/WIRE-PROTOCOL.md`).
 *
 * `HttpServerTransport` writes each NDJSON stream with `writeNdjsonStream`. A server without
 * Express can use the function too: it takes a `ServerResponse` of `node:http`. This module
 * imports only the types of `node:http`, so it loads no Node code at run time.
 */

import type { ServerResponse } from "node:http";
import { realClock, type Cancel, type Clock } from "../../../clock.js";
import { toMs, type Duration } from "../../../duration.js";
import { PROTOCOL_HEADER, PROTOCOL_VERSION, errorCodeOf, retryableOf } from "../../../protocol.js";
import { TIMER_DEFAULTS } from "../../../timers.js";

/** The media type of a stream response: one JSON value on each line. */
export const NDJSON_MEDIA_TYPE = "application/x-ndjson";

/** The keep-alive line of an NDJSON stream: a blank line. A reader skips it. It has no `seq`. */
export const KEEP_ALIVE_LINE = "\n";

/** The longest delay of a Node timer. A longer delay starts the timer at once. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** The error of an `error` line: its code, its message and its retryable flag. */
export interface NdjsonError {
  code: string;
  message: string;
  retryable: boolean;
}

/** The options of `writeNdjsonStream`. */
export interface WriteNdjsonStreamOptions {
  /**
   * The signal of the request. Its abort stops the stream. The iterator of the items gets
   * `return()`, and a response that is still open gets the error line `ABORTED`.
   */
  readonly signal?: AbortSignal | undefined;
  /**
   * The quiet time after which the writer sends a keep-alive line. Each line starts the time again.
   * `false`, or a duration of zero or less, sends no keep-alive line.
   * @default seconds(15) (`TIMER_DEFAULTS.httpServer.keepAliveMs`)
   */
  readonly keepAlive?: Duration | false | undefined;
  /**
   * The function that gives the `error` line of an error of the stream. `items` is the count of the
   * item lines before the error. The default gives the code of the error (`errorCodeOf`), its
   * message and its retryable flag (`retryableOf`). Without a flag of its own, the error gets the
   * flag of its code before the first item, and `false` after it (CLI-68).
   */
  readonly errorOf?: ((error: unknown, items: number) => NdjsonError) | undefined;
  /**
   * The clock of the keep-alive timer (roadmap R35). The default is the clock of the platform. A
   * test gives a fake clock.
   */
  readonly clock?: Clock | undefined;
}

/**
 * This function gives the `error` line of a thrown error: its code, its message and its retryable
 * flag (deep dive TRN-7). A code that is not a string gives `HANDLER_ERROR`. `items` is the count of
 * the item lines before the error. An error without a flag gets the flag of its code before the
 * first item (CLI-68). After the first item, it gets false: a retry can send the items again
 * (CLI-58, `retryableOf`, `WIRE-PROTOCOL.md`, section "Error codes").
 */
export function defaultNdjsonError(error: unknown, items: number): NdjsonError {
  return {
    code: errorCodeOf(error),
    message: error instanceof Error ? error.message : String(error),
    retryable: retryableOf(error, items),
  };
}

/**
 * This function gives the keep-alive time in milliseconds, or 0 for no keep-alive. A value that is
 * not a duration throws a `TypeError`.
 */
export function keepAliveMsOf(keepAlive: Duration | false | undefined): number {
  if (keepAlive === false) return 0;
  if (keepAlive === undefined) return TIMER_DEFAULTS.httpServer.keepAliveMs;
  const value = toMs(keepAlive, "keepAlive");
  return value > 0 ? Math.min(value, MAX_TIMER_DELAY_MS) : 0;
}

/** One JSON line of the stream. */
function lineOf(frame: unknown): string {
  return `${JSON.stringify(frame)}\n`;
}

/**
 * This function gives the next result of the iterator, or `undefined` when the stop signal
 * aborts first. Thus a quiet iterator does not keep a stopped stream open. The listener goes
 * away after each step, so a long stream adds no listener.
 */
function nextOrStop<T>(iterator: AsyncIterator<T>, stop: AbortSignal): Promise<IteratorResult<T> | undefined> {
  if (stop.aborted) return Promise.resolve(undefined);
  return new Promise<IteratorResult<T> | undefined>((resolve, reject) => {
    const onStop = (): void => resolve(undefined);
    stop.addEventListener("abort", onStop, { once: true });
    Promise.resolve(iterator.next()).then(
      (result) => {
        stop.removeEventListener("abort", onStop);
        resolve(result);
      },
      (error: unknown) => {
        stop.removeEventListener("abort", onStop);
        reject(error);
      },
    );
  });
}

/**
 * This function waits until the response can take more data: the `drain` event. A closed
 * connection or the stop signal also ends the wait (deep dive TRN-3).
 */
function drained(res: ServerResponse, stop: AbortSignal): Promise<void> {
  if (stop.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = (): void => {
      res.off("drain", done);
      res.off("close", done);
      stop.removeEventListener("abort", done);
      resolve();
    };
    res.on("drain", done);
    res.on("close", done);
    stop.addEventListener("abort", done, { once: true });
  });
}

/**
 * This function writes a stream of items as an NDJSON response of wire protocol v1.
 *
 * - It writes the status 200, the headers `Content-Type: application/x-ndjson`,
 *   `Cache-Control: no-cache` and `Procedures-Protocol: 1`, and it sends them at once.
 * - Each item gives the line `{"type":"item","seq":n,"payload":...}`. The `seq` counts from 1.
 * - The end of the items gives `{"type":"done","seq":n}`. An error gives
 *   `{"type":"error","error":{"code":...,"message":...,"retryable":...}}`, without `seq`.
 * - After each quiet time of `keepAlive`, it writes a keep-alive line: a blank line. Each line
 *   starts the time again. No keep-alive line comes after the last line.
 * - When `write()` gives false, it waits for `drain` before it reads the next item.
 * - A closed connection or an abort of `signal` stops it. The iterator gets `return()`. After an
 *   abort, a response that is still open gets the error line `ABORTED`.
 *
 * The promise resolves when the response ends. It does not reject: an error of the items becomes
 * the error line.
 */
export async function writeNdjsonStream(res: ServerResponse, items: AsyncIterable<unknown>, options: WriteNdjsonStreamOptions = {}): Promise<void> {
  const interval = keepAliveMsOf(options.keepAlive);
  const clock = options.clock ?? realClock;
  const errorOf = options.errorOf ?? defaultNdjsonError;
  const { signal } = options;

  // One stop for the abort of the caller and for a closed connection
  const stop = new AbortController();
  const onAbort = (): void => stop.abort();
  const onClose = (): void => {
    if (!res.writableFinished) stop.abort();
  };
  if (signal?.aborted || res.destroyed) stop.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  res.on("close", onClose);

  // The keep-alive timer. Each line starts the quiet time again, but a line does not start a new
  // timer: when the timer comes due, it examines the time of the last line. Thus a fast stream
  // has one timer for each quiet time, not one for each item.
  let timer: Cancel | undefined;
  let lastLine = 0;
  const stopTimer = (): void => {
    timer?.();
    timer = undefined;
  };
  const arm = (delay: number): void => {
    timer = clock.after(delay, keepAlive);
    timer.unref?.();
  };
  /** This function records a line: the quiet time starts again. */
  const startTimer = (): void => {
    lastLine = clock.now();
    if (timer === undefined && interval > 0 && !stop.signal.aborted && !res.writableEnded) arm(interval);
  };
  function keepAlive(): void {
    timer = undefined;
    if (stop.signal.aborted || res.writableEnded || res.destroyed) return;
    const quiet = clock.now() - lastLine;
    if (quiet < interval) {
      // A line went out after the start of this timer: wait for the rest of the quiet time
      arm(interval - quiet);
      return;
    }
    // A full buffer waits for the reader. One more byte there does not reach the reader sooner.
    if (!res.writableNeedDrain) res.write(KEEP_ALIVE_LINE);
    startTimer();
  }

  /** This function ends an open response after an abort: the server stopped the request. */
  const endAborted = (): void => {
    if (!res.writableEnded && !res.destroyed) {
      res.end(lineOf({ type: "error", error: { code: "ABORTED", message: "The server stopped the request", retryable: true } }));
    }
  };

  const iterator = items[Symbol.asyncIterator]();
  /** True when the iterator ended by itself: at its end, or with an error */
  let ended = false;
  let seq = 0;
  try {
    if (!res.headersSent && !res.destroyed) {
      res.statusCode = 200;
      res.setHeader(PROTOCOL_HEADER, String(PROTOCOL_VERSION));
      res.setHeader("Content-Type", NDJSON_MEDIA_TYPE);
      res.setHeader("Cache-Control", "no-cache");
      res.flushHeaders();
    }
    startTimer();
    for (;;) {
      let next: IteratorResult<unknown> | undefined;
      try {
        next = await nextOrStop(iterator, stop.signal);
      } catch (error) {
        ended = true;
        throw error;
      }
      if (next === undefined) break;
      if (next.done) {
        ended = true;
        break;
      }
      if (stop.signal.aborted) break;
      const room = res.write(lineOf({ type: "item", seq: ++seq, payload: next.value }));
      startTimer();
      if (!room) await drained(res, stop.signal);
      if (stop.signal.aborted) break;
    }
    stopTimer();
    if (stop.signal.aborted) {
      endAborted();
      return;
    }
    res.end(lineOf({ type: "done", seq: ++seq }));
  } catch (error) {
    stopTimer();
    if (stop.signal.aborted) {
      endAborted();
      return;
    }
    // The count of the item lines before the error: before the first item, an error without a flag
    // gets the flag of its code (CLI-68)
    const items = seq;
    let info: NdjsonError;
    try {
      info = errorOf(error, items);
    } catch {
      // A failed errorOf does not leave the response open
      info = defaultNdjsonError(error, items);
    }
    res.end(lineOf({ type: "error", error: info }));
  } finally {
    stopTimer();
    signal?.removeEventListener("abort", onAbort);
    res.off("close", onClose);
    // A stream that stopped early: its producer stops too. A pending next() keeps the return()
    // waiting, so the writer does not wait for it.
    if (!ended) void Promise.resolve().then(() => iterator.return?.()).catch(() => undefined);
  }
}
