/**
 * docker.volume.remove procedure
 *
 * Remove volumes (roadmap R41). The data of a removed volume is lost. Docker refuses a volume
 * that a container uses.
 */

import type { ProcedureContext } from "@procedures/client";
import { dockerArg, runDocker } from "../shared.js";
import type { DockerVolumeRemoveInput, DockerVolumeRemoveOutput } from "../../../types.js";

/**
 * Remove volumes
 */
export async function dockerVolumeRemove(input: DockerVolumeRemoveInput, ctx: ProcedureContext): Promise<DockerVolumeRemoveOutput> {
  const args = ["volume", "rm"];
  if (input.force) args.push("--force");
  args.push(...input.volumes.map((volume) => dockerArg("volume", volume)));
  return runDocker(args, input, ctx);
}
