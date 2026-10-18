/**
 * The procedure of `@procedures/exif`: `exif.read`.
 */

import { open } from "node:fs/promises";
import { createProcedure, zodAdapter, type AnyProcedure, type FsRootRules } from "@procedures/client";
import { z } from "zod";
import { readExif, type PhotoFacts } from "./exif.js";

/** The EXIF block is in the first APP1 segment, at most 64 KiB after the start of the file. */
const HEAD_BYTES = 128 * 1024;

/** This function reads the first bytes of a file. */
export async function readHead(path: string, size: number = HEAD_BYTES): Promise<Uint8Array> {
  const file = await open(path, "r");
  try {
    const buffer = new Uint8Array(size);
    const { bytesRead } = await file.read(buffer, 0, size, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

const ReadInputSchema = z.object({
  path: z.string().min(1).describe("The path of a JPEG file"),
});
type ReadInput = z.infer<typeof ReadInputSchema>;
const ReadOutputSchema = z.object({ takenAt: z.string().optional(), lat: z.number().optional(), lon: z.number().optional() });

/** The rule of `exif.read` under a root of the files (roadmap R33, tracker item O36): the photo is in the root. */
const READ_IN_A_ROOT: FsRootRules = { paths: ["path"] };

export const exifReadProcedure: AnyProcedure = createProcedure()
  .path(["exif", "read"])
  .input(zodAdapter<ReadInput>(ReadInputSchema))
  .output(zodAdapter<PhotoFacts>(ReadOutputSchema))
  .meta({
    description: "Read when and where a JPEG photo was taken (EXIF time and GPS position)",
    args: ["path"],
    output: "json",
    effects: { reads: ["fs"], writes: [] },
    fsRoot: READ_IN_A_ROOT,
  })
  .handler(async (input: ReadInput): Promise<PhotoFacts> => readExif(await readHead(input.path)))
  .build() as AnyProcedure;

export const exifProcedures: AnyProcedure[] = [exifReadProcedure];
