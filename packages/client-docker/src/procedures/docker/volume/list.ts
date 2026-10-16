/**
 * docker.volume.list procedure
 *
 * List volumes (roadmap R41).
 */

import type { ProcedureContext } from "@procedures/client";
import { runDocker } from "../shared.js";
import type { DockerVolumeListInput, DockerVolumeListOutput } from "../../../types.js";

/**
 * List volumes
 */
export async function dockerVolumeList(input: DockerVolumeListInput, ctx: ProcedureContext): Promise<DockerVolumeListOutput> {
  const args = ["volume", "ls"];
  if (input.filter) args.push("--filter", input.filter);
  if (input.format) args.push("--format", input.format);
  return runDocker(args, input, ctx);
}
