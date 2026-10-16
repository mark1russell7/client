/**
 * fs.hash procedure (roadmap R44)
 *
 * The hash of a file. The procedure reads the file as a stream, so a large file does not fill
 * the memory.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { FsHashInput, FsHashOutput } from "../../types.js";

/**
 * The hash of a file
 */
export async function fsHash(input: FsHashInput): Promise<FsHashOutput> {
  const algorithm = input.algorithm ?? "sha256";
  const hash = createHash(algorithm);
  let size = 0;
  for await (const chunk of createReadStream(input.path)) {
    const bytes = chunk as Buffer;
    size += bytes.length;
    hash.update(bytes);
  }
  return { path: input.path, algorithm, hash: hash.digest("hex"), size };
}
