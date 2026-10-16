/**
 * gh.run.download procedure
 *
 * Download the artifacts of a workflow run
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhRunDownloadInput, GhRunDownloadOutput } from "../../../types.js";
import { ghArg, repoArgs, runGh } from "../shared.js";

/**
 * This function downloads the artifacts of a run with `gh run download`. gh puts each artifact in
 * a folder with its name. When the input selects one artifact, gh puts its files directly in `dir`.
 * gh does not replace a file that exists: the download then fails.
 */
export async function ghRunDownload(input: GhRunDownloadInput, ctx: ProcedureContext): Promise<GhRunDownloadOutput> {
  const args = ["run", "download", String(input.run), ...repoArgs(input)];
  for (const name of input.names ?? []) args.push("--name", ghArg("name", name));
  for (const pattern of input.patterns ?? []) args.push("--pattern", ghArg("pattern", pattern));
  if (input.dir !== undefined) args.push("--dir", ghArg("dir", input.dir));
  await runGh(args, input, ctx);
  return { run: input.run, dir: input.dir ?? "." };
}
