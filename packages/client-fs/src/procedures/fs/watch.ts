/**
 * fs.watch procedure (roadmap R44)
 *
 * The changes of a file or folder, as a stream: one item for each change that the platform
 * reports. The stream has no end: it stops when the reader stops or the signal of the call
 * aborts. The platform decides the details: a change can give two items, and some platforms
 * give no file name.
 */

import { on } from "node:events";
import { watch } from "node:fs";
import type { FsWatchInput, FsWatchOutput } from "../../types.js";

/** True for the error of an aborted call. */
function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

/**
 * This function opens a watcher of a file or folder at once, and gives its changes as a stream.
 * The watcher reads the path when this function starts, not at the first read of the stream. The
 * stream closes the watcher when it ends.
 */
export function openWatch(input: FsWatchInput, signal?: AbortSignal): AsyncGenerator<FsWatchOutput, void, undefined> {
  const watcher = watch(input.path, { recursive: input.recursive ?? false, ...(signal ? { signal } : {}) });
  // The listener starts with the watcher, so a change before the first read waits in its queue
  const changes = on(watcher, "change", { close: ["close"], ...(signal ? { signal } : {}) });
  return (async function* () {
    try {
      for await (const [eventType, filename] of changes) {
        yield { event: eventType === "change" ? "change" : "rename", filename: filename === undefined || filename === null ? null : String(filename) };
      }
    } catch (error) {
      // The abort of the call ends the stream without an error
      if (isAbort(error)) return;
      throw error;
    } finally {
      watcher.close();
    }
  })();
}

/**
 * The changes of a file or folder, as a stream
 */
export async function* fsWatch(input: FsWatchInput, signal?: AbortSignal): AsyncGenerator<FsWatchOutput, void, undefined> {
  yield* openWatch(input, signal);
}
