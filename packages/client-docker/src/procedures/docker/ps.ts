/**
 * docker.ps procedure
 *
 * List containers.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { runDocker } from "./shared.js";
import type { DockerPsInput, DockerCommandOutput } from "../../types.js";

/**
 * List containers
 */
export async function dockerPs(
  input: DockerPsInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  {
    const args: string[] = ["ps"];

    if (input.all) args.push("-a");
    if (input.filter) args.push("--filter", input.filter);
    if (input.format) args.push("--format", input.format);

    return runDocker(args, input, ctx);
  }
}
