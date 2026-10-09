/**
 * docker.rm procedure
 *
 * Remove container(s).
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { dockerArg, runDocker } from "./shared.js";
import type { DockerRmInput, DockerCommandOutput } from "../../types.js";

/**
 * Remove container(s)
 */
export async function dockerRm(
  input: DockerRmInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  {
    const args: string[] = ["rm"];

    if (input.force) args.push("-f");
    if (input.volumes) args.push("-v");

    args.push(...input.containers.map((c) => dockerArg("container", c)));

    return runDocker(args, input, ctx);
  }
}
