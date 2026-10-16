/**
 * fs.watch procedure (roadmap R44)
 *
 * The changes of a file or folder, as a stream: one item for each change that the platform
 * reports. The stream has no end: it stops when the reader stops or the signal of the call
 * aborts. The platform decides the details: a change can give two items, and some platforms
 * give no file name.
 */

import { watch } from "node:fs/promises";
import type { FsWatchInput, FsWatchOutput } from "../../types.js";

/**
 * The changes of a file or folder, as a stream
 */
export async function* fsWatch(input: FsWatchInput, signal?: AbortSignal): AsyncGenerator<FsWatchOutput, void, undefined> {
  try {
    for await (const change of watch(input.path, { recursive: input.recursive ?? false, ...(signal ? { signal } : {}) })) {
      yield { event: change.eventType === "change" ? "change" : "rename", filename: change.filename ?? null };
    }
  } catch (error) {
    // The abort of the call ends the stream without an error
    if ((error as { name?: string }).name === "AbortError") return;
    throw error;
  }
}
