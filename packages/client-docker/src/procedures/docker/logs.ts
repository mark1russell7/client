/**
 * docker.logs procedure
 *
 * Get container logs.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { dockerArg, runDocker } from "./shared.js";
import type { DockerLogsInput, DockerCommandOutput } from "../../types.js";

/**
 * Get container logs
 */
export async function dockerLogs(
  input: DockerLogsInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  {
    const args: string[] = ["logs"];

    if (input.follow) args.push("-f");
    if (input.tail !== undefined) args.push("--tail", String(input.tail));
    if (input.timestamps) args.push("-t");

    args.push(dockerArg("container", input.container));

    return runDocker(args, input, ctx);
  }
}
