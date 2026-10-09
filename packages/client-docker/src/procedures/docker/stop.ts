/**
 * docker.stop procedure
 *
 * Stop running container(s).
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { dockerArg, runDocker } from "./shared.js";
import type { DockerStopInput, DockerCommandOutput } from "../../types.js";

/**
 * Stop container(s)
 */
export async function dockerStop(
  input: DockerStopInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  {
    const args: string[] = ["stop"];

    if (input.time !== undefined) {
      args.push("-t", String(input.time));
    }

    args.push(...input.containers.map((c) => dockerArg("container", c)));

    return runDocker(args, input, ctx);
  }
}
