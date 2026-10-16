/**
 * fs.write.json procedure (roadmap R44)
 *
 * Write a value as a JSON file. The procedure writes a file next to the target, then renames it,
 * so a reader sees the old file or the whole new file, never a half-written one.
 */

import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import type { FsWriteJsonInput, FsWriteJsonOutput } from "../../types.js";

/**
 * Write a value as a JSON file, with a rename at the end
 */
export async function fsWriteJson(input: FsWriteJsonInput): Promise<FsWriteJsonOutput> {
  const text = JSON.stringify(input.value ?? null, null, input.indent ?? 2);
  if (text === undefined) throw new Error("fs.write.json: the value has no JSON form");
  const content = `${text}\n`;
  const temporary = `${input.path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, input.path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  return { path: input.path, bytesWritten: Buffer.byteLength(content, "utf8") };
}
