/**
 * docker.volume.create procedure
 *
 * Create a volume (roadmap R41). Docker keeps a volume that exists: a second call with the same
 * name changes nothing. The output is the name of the volume.
 */

import type { ProcedureContext } from "@procedures/client";
import { dockerArg, labelArgs, runDocker } from "../shared.js";
import type { DockerVolumeCreateInput, DockerVolumeCreateOutput } from "../../../types.js";

/**
 * Create a volume
 */
export async function dockerVolumeCreate(input: DockerVolumeCreateInput, ctx: ProcedureContext): Promise<DockerVolumeCreateOutput> {
  const args = ["volume", "create"];
  if (input.driver) args.push("--driver", input.driver);
  args.push(...labelArgs(input.labels));
  if (input.name) args.push(dockerArg("volume", input.name));
  return runDocker(args, input, ctx);
}
