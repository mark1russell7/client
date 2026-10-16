/**
 * docker.compose.logs procedure
 *
 * Get the logs of the services of a compose project (roadmap R41). The procedure does not follow
 * the logs: it gives the lines that exist, without colors.
 */

import type { ProcedureContext } from "@procedures/client";
import { composeArgs, runDocker, serviceArgs } from "../shared.js";
import type { DockerComposeLogsInput, DockerComposeLogsOutput } from "../../../types.js";

/**
 * Get the logs of the services of a compose project
 */
export async function dockerComposeLogs(input: DockerComposeLogsInput, ctx: ProcedureContext): Promise<DockerComposeLogsOutput> {
  const args = composeArgs(input.file, "logs");
  args.push("--no-color");
  if (input.tail !== undefined) args.push("--tail", String(input.tail));
  if (input.since) args.push("--since", input.since);
  if (input.timestamps) args.push("--timestamps");
  args.push(...serviceArgs(input.services));
  return runDocker(args, input, ctx);
}
