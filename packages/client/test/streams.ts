/**
 * The helpers of the tests of the NDJSON streams.
 *
 * - `openStream` is a raw reader of an HTTP stream response. It sends one POST with `node:http`
 *   and keeps the text of the body as it arrives, so a test sees each keep-alive line. The test
 *   can pause the reader, start it again, and close the connection.
 * - `feedOf` gives the items of a streaming procedure. The test pushes each item, so the stream
 *   is quiet until the test pushes the next one.
 */

import { request, type IncomingHttpHeaders, type IncomingMessage } from "node:http";

/** The head of a response: its status and its headers. */
export interface RawHead {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
}

/** One open request and the text of its response body so far. */
export interface RawStream {
  /** The text of the body so far. */
  readonly text: string;
  /** This promise resolves with the head of the response. */
  readonly head: Promise<RawHead>;
  /** This promise resolves when the body ends or the connection closes. */
  readonly ended: Promise<void>;
  /** This method waits until the text agrees with the check, for two seconds at most. */
  until(check: (text: string) => boolean, what: string): Promise<void>;
  /** The reader stops reading: the socket buffers fill, and the server sees backpressure. */
  pause(): void;
  /** The reader reads again. */
  resume(): void;
  /** The reader closes the connection. */
  destroy(): void;
}

/** This function sends a POST with an NDJSON `Accept` header, and gives the stream of its response. */
export function openStream(url: string, body: unknown = {}): RawStream {
  let text = "";
  let response: IncomingMessage | undefined;
  let resolveHead: (head: RawHead) => void = () => undefined;
  let resolveEnd: () => void = () => undefined;
  const head = new Promise<RawHead>((resolve) => (resolveHead = resolve));
  const ended = new Promise<void>((resolve) => (resolveEnd = resolve));
  const req = request(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson, application/json" } }, (res) => {
    response = res;
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => (text += chunk));
    res.on("end", () => resolveEnd());
    res.on("close", () => resolveEnd());
    res.on("error", () => resolveEnd());
    resolveHead({ status: res.statusCode ?? 0, headers: res.headers });
  });
  req.on("error", () => resolveEnd());
  req.end(JSON.stringify(body));
  return {
    get text() {
      return text;
    },
    head,
    ended,
    async until(check, what) {
      const end = Date.now() + 2000;
      while (!check(text)) {
        if (Date.now() > end) throw new Error(`until: ${what}. The text is ${JSON.stringify(text)}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    pause: () => response?.pause(),
    resume: () => response?.resume(),
    destroy: () => req.destroy(),
  };
}

/** This function waits for a real time, so that the bytes of a write can arrive. */
export const sleep = (time: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, time));

/** The items of a streaming procedure that a test gives one at a time. */
export interface Feed {
  /** The stream gives this item next. */
  push(value: unknown): void;
  /** The stream ends after the items that it has. */
  end(): void;
  /** The stream throws this error after the items that it has. */
  fail(error: unknown): void;
  /** The items. The abort of the signal ends them. */
  items(signal: AbortSignal | undefined): AsyncGenerator<unknown, void, undefined>;
  /** True when the items ended: at their end, by an error, by `return()` or by an abort. */
  readonly returned: boolean;
}

/** This function makes a feed. */
export function feedOf(): Feed {
  type Entry = { value: unknown } | { end: true } | { error: unknown };
  const queue: Entry[] = [];
  let wake: () => void = () => undefined;
  let returned = false;
  const put = (entry: Entry): void => {
    queue.push(entry);
    wake();
  };
  return {
    push: (value) => put({ value }),
    end: () => put({ end: true }),
    fail: (error) => put({ error }),
    async *items(signal) {
      try {
        for (;;) {
          while (queue.length === 0) {
            if (signal?.aborted) return;
            await new Promise<void>((resolve) => {
              wake = resolve;
              signal?.addEventListener("abort", () => resolve(), { once: true });
            });
          }
          const entry = queue.shift()!;
          if ("error" in entry) throw entry.error;
          if ("end" in entry) return;
          yield entry.value;
        }
      } finally {
        returned = true;
      }
    },
    get returned() {
      return returned;
    },
  };
}

/** The NDJSON line of an item. */
export const itemLine = (seq: number, payload: unknown): string => `${JSON.stringify({ type: "item", seq, payload })}\n`;

/** The NDJSON line of the end. */
export const doneLine = (seq: number): string => `${JSON.stringify({ type: "done", seq })}\n`;
