/**
 * docker.push procedure
 *
 * Push an image to a registry (roadmap R41). The registry replaces an image with the same tag.
 * Docker uses the credentials of `docker login`.
 */

import type { ProcedureContext } from "@procedures/client";
import { dockerArg, runDocker } from "./shared.js";
import type { DockerPushInput, DockerPushOutput } from "../../types.js";

/**
 * Push an image to a registry
 */
export async function dockerPush(input: DockerPushInput, ctx: ProcedureContext): Promise<DockerPushOutput> {
  const args = ["push"];
  if (input.allTags) args.push("--all-tags");
  args.push(dockerArg("image", input.image));
  return runDocker(args, input, ctx);
}
