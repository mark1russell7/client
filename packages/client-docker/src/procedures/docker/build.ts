/**
 * docker.build procedure
 *
 * Build a Docker image.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { dockerArg, runDocker } from "./shared.js";
import type { DockerBuildInput, DockerCommandOutput } from "../../types.js";

/**
 * Build a Docker image
 */
export async function dockerBuild(
  input: DockerBuildInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  {
    const args: string[] = ["build"];

    // Add tag
    args.push("-t", input.tag);

    // Add dockerfile if specified
    if (input.dockerfile) {
      args.push("-f", input.dockerfile);
    }

    // Add build args
    if (input.buildArgs) {
      for (const [key, value] of Object.entries(input.buildArgs)) {
        args.push("--build-arg", `${key}=${value}`);
      }
    }

    // Add no-cache flag
    if (input.noCache) {
      args.push("--no-cache");
    }

    // Add context
    args.push(dockerArg("context", input.context));

    return runDocker(args, input, ctx);
  }
}
