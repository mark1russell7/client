/**
 * fs.write.json procedure (roadmap R44)
 *
 * Write a value as a JSON file. The procedure writes a file next to the target, then renames it,
 * so a reader sees the old file or the whole new file, never a half-written one.
 */

import { writeFileAtomic } from "../../files/atomic.js";
import type { FsWriteJsonInput, FsWriteJsonOutput } from "../../types.js";

/**
 * Write a value as a JSON file, with a rename at the end
 */
export async function fsWriteJson(input: FsWriteJsonInput): Promise<FsWriteJsonOutput> {
  const text = JSON.stringify(input.value ?? null, null, input.indent ?? 2);
  if (text === undefined) throw new Error("fs.write.json: the value has no JSON form");
  const content = `${text}\n`;
  // writeFileAtomic flushes the file, tries the rename again on Windows and removes the temporary file after a failure
  await writeFileAtomic(input.path, content, { encoding: "utf8" });
  return { path: input.path, bytesWritten: Buffer.byteLength(content, "utf8") };
}
