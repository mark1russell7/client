/**
 * docker.compose.restart procedure
 *
 * Restart the services of a compose project (roadmap R41).
 */

import type { ProcedureContext } from "@procedures/client";
import { composeArgs, runDocker, serviceArgs } from "../shared.js";
import type { DockerComposeRestartInput, DockerComposeRestartOutput } from "../../../types.js";

/**
 * Restart the services of a compose project
 */
export async function dockerComposeRestart(input: DockerComposeRestartInput, ctx: ProcedureContext): Promise<DockerComposeRestartOutput> {
  const args = composeArgs(input.file, "restart");
  if (input.time !== undefined) args.push("--timeout", String(input.time));
  args.push(...serviceArgs(input.services));
  return runDocker(args, input, ctx);
}
