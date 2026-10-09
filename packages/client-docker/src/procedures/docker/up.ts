/**
 * docker.compose.up procedure
 *
 * Start services with docker compose.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { dockerArg, runDocker } from "./shared.js";
import type { DockerComposeUpInput, DockerCommandOutput } from "../../types.js";

/**
 * Start services with docker compose
 */
export async function dockerComposeUp(
  input: DockerComposeUpInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  {
    const args: string[] = ["compose"];

    if (input.file) args.push("-f", input.file);

    args.push("up");

    if (input.detach) args.push("-d");
    if (input.build) args.push("--build");
    if (input.forceRecreate) args.push("--force-recreate");

    if (input.services && input.services.length > 0) {
      args.push(...input.services.map((s) => dockerArg("service", s)));
    }

    return runDocker(args, input, ctx);
  }
}
