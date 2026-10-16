/**
 * A queue store in a JSON Lines file, for Node (roadmap R28).
 *
 * This module is the entry `@procedures/store/file-queue`. It uses `node:fs`, so the root of the
 * package does not import it.
 *
 * - Each line of the file is one `QueuedOperation`, the oldest first.
 * - `append` adds a line. `replace` and `clear` write a temporary file and rename it, so a reader
 *   never sees a part of a replace.
 * - A process that stops during an append can leave a part of a line at the end. `load` drops
 *   that part and writes the file again. Its write was not acknowledged.
 * - One storage uses one file. Two processes must not use the same file.
 */

import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { retryOnContention } from "../program-store/file.js";
import { isQueuedOperation, type QueuedOperation, type QueueStore } from "./queue.js";

export type { QueuedOperation, QueueStore } from "./queue.js";

/** A queue store in a JSON Lines file. */
export class FileQueueStore implements QueueStore {
  /** The calls of this instance, one at a time */
  private chain: Promise<unknown> = Promise.resolve();

  /** @param path - The file. The store makes it, and its folder, at the first write. */
  constructor(readonly path: string) {}

  load(): Promise<QueuedOperation[]> {
    return this.serial(async () => {
      let text: string;
      try {
        text = await retryOnContention(() => readFile(this.path, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
      const lines = text.split("\n");
      // The text after the last newline is a part of a line, or empty
      const tail = lines.pop() ?? "";
      const operations = lines.filter((line) => line.trim() !== "").map((line, index) => this.parse(line, index + 1));
      if (tail.trim() !== "") {
        let last: QueuedOperation | undefined;
        try {
          last = this.parse(tail, lines.length + 1);
        } catch {
          // An append that did not finish: drop it
        }
        if (last) operations.push(last);
        await this.write(operations);
      }
      return operations;
    });
  }

  append(operation: QueuedOperation): Promise<void> {
    return this.serial(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await retryOnContention(() => appendFile(this.path, `${JSON.stringify(operation)}\n`, "utf8"));
    });
  }

  replace(operations: QueuedOperation[]): Promise<void> {
    return this.serial(() => this.write(operations));
  }

  clear(): Promise<void> {
    return this.serial(() => this.write([]));
  }

  private parse(line: string, number: number): QueuedOperation {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`The queue file ${this.path} has a line that is not JSON (line ${number}). The store does not write over it.`);
    }
    if (!isQueuedOperation(value)) {
      throw new Error(`The queue file ${this.path} has a line that is not a queued operation (line ${number})`);
    }
    return value;
  }

  /** Write the file through a temporary file and a rename. */
  private async write(operations: QueuedOperation[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await writeFile(temporary, operations.map((operation) => `${JSON.stringify(operation)}\n`).join(""), "utf8");
      await retryOnContention(() => rename(temporary, this.path));
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  private serial<R>(run: () => Promise<R>): Promise<R> {
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }
}
