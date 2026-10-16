/**
 * docker.compose.ps procedure
 *
 * List the containers of a compose project (roadmap R41).
 */

import type { ProcedureContext } from "@procedures/client";
import { composeArgs, runDocker, serviceArgs } from "../shared.js";
import type { DockerComposePsInput, DockerComposePsOutput } from "../../../types.js";

/**
 * List the containers of a compose project
 */
export async function dockerComposePs(input: DockerComposePsInput, ctx: ProcedureContext): Promise<DockerComposePsOutput> {
  const args = composeArgs(input.file, "ps");
  if (input.all) args.push("--all");
  if (input.format) args.push("--format", input.format);
  args.push(...serviceArgs(input.services));
  return runDocker(args, input, ctx);
}
