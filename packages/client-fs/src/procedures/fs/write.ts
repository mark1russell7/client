/**
 * write procedure
 *
 * Write content to file
 */

import { writeFile, appendFile } from "node:fs/promises";
import type { WriteInput, WriteOutput } from "../../types.js";

/**
 * Write content to file
 */
export async function write(input: WriteInput): Promise<WriteOutput> {
  const { path, content, encoding, mode } = input;
  const writeOptions = { encoding: encoding as BufferEncoding };

  if (mode === "append") {
    await appendFile(path, content, writeOptions);
  } else {
    await writeFile(path, content, writeOptions);
  }

  return {
    path,
    bytesWritten: Buffer.byteLength(content, encoding as BufferEncoding),
  };
}
