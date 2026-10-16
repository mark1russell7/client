/**
 * docker.tag procedure
 *
 * Give an image another name (roadmap R41). An image that had the target name loses it.
 */

import type { ProcedureContext } from "@procedures/client";
import { dockerArg, runDocker } from "./shared.js";
import type { DockerTagInput, DockerTagOutput } from "../../types.js";

/**
 * Give an image another name
 */
export async function dockerTag(input: DockerTagInput, ctx: ProcedureContext): Promise<DockerTagOutput> {
  const args = ["tag", dockerArg("source", input.source), dockerArg("target", input.target)];
  return runDocker(args, input, ctx);
}
