/**
 * docker.compose.build procedure
 *
 * Build the images of the services of a compose project (roadmap R41).
 */

import type { ProcedureContext } from "@procedures/client";
import { composeArgs, runDocker, serviceArgs } from "../shared.js";
import type { DockerComposeBuildInput, DockerComposeBuildOutput } from "../../../types.js";

/**
 * Build the images of the services of a compose project
 */
export async function dockerComposeBuild(input: DockerComposeBuildInput, ctx: ProcedureContext): Promise<DockerComposeBuildOutput> {
  const args = composeArgs(input.file, "build");
  if (input.noCache) args.push("--no-cache");
  if (input.pull) args.push("--pull");
  for (const [key, value] of Object.entries(input.buildArgs ?? {})) {
    args.push("--build-arg", `${key}=${value}`);
  }
  args.push(...serviceArgs(input.services));
  return runDocker(args, input, ctx);
}
