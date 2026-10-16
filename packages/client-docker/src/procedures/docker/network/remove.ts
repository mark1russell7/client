/**
 * docker.network.remove procedure
 *
 * Remove networks (roadmap R41). Docker refuses a network that a container uses.
 */

import type { ProcedureContext } from "@procedures/client";
import { dockerArg, runDocker } from "../shared.js";
import type { DockerNetworkRemoveInput, DockerNetworkRemoveOutput } from "../../../types.js";

/**
 * Remove networks
 */
export async function dockerNetworkRemove(input: DockerNetworkRemoveInput, ctx: ProcedureContext): Promise<DockerNetworkRemoveOutput> {
  const args = ["network", "rm", ...input.networks.map((network) => dockerArg("network", network))];
  return runDocker(args, input, ctx);
}
