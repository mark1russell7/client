/**
 * docker.network.list procedure
 *
 * List networks (roadmap R41).
 */

import type { ProcedureContext } from "@procedures/client";
import { runDocker } from "../shared.js";
import type { DockerNetworkListInput, DockerNetworkListOutput } from "../../../types.js";

/**
 * List networks
 */
export async function dockerNetworkList(input: DockerNetworkListInput, ctx: ProcedureContext): Promise<DockerNetworkListOutput> {
  const args = ["network", "ls"];
  if (input.filter) args.push("--filter", input.filter);
  if (input.format) args.push("--format", input.format);
  return runDocker(args, input, ctx);
}
