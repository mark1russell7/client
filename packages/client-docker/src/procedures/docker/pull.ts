/**
 * docker.pull procedure
 *
 * Pull a Docker image.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { dockerArg, runDocker } from "./shared.js";
import type { DockerPullInput, DockerCommandOutput } from "../../types.js";

/**
 * Pull a Docker image
 */
export async function dockerPull(
  input: DockerPullInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  {
    const imageWithTag = input.tag ? `${input.image}:${input.tag}` : input.image;
    const args = ["pull", dockerArg("image", imageWithTag)];
    return runDocker(args, input, ctx);
  }
}
