/**
 * fs.temp procedure (roadmap R44)
 *
 * Make a temporary folder with a name that no other folder has. Without a root, the folder is in
 * the temporary folder of the system. With the root of `createFsModule({ root })`, it is in the
 * folder `.tmp` of the root, so it stays inside the root.
 */

import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { sep } from "node:path";
import type { FsTempInput, FsTempOutput } from "../../types.js";

/**
 * Make a temporary folder. `base` is the folder that holds it (default: the temporary folder of
 * the system). The prefix is only the start of the name in `base`, also when it is `.` or `..`.
 */
export async function fsTemp(input: FsTempInput, base: string = tmpdir()): Promise<FsTempOutput> {
  await mkdir(base, { recursive: true });
  // No path arithmetic: `join` reads the prefix `..` as the parent folder of base
  const start = base.endsWith(sep) ? base : base + sep;
  const path = await mkdtemp(start + (input.prefix ?? "procedures-"));
  return { path };
}
