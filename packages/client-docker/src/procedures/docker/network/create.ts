/**
 * docker.network.create procedure
 *
 * Create a network (roadmap R41). Docker refuses a name that exists, so a second call changes
 * nothing. The output is the ID of the network.
 */

import type { ProcedureContext } from "@procedures/client";
import { dockerArg, labelArgs, runDocker } from "../shared.js";
import type { DockerNetworkCreateInput, DockerNetworkCreateOutput } from "../../../types.js";

/**
 * Create a network
 */
export async function dockerNetworkCreate(input: DockerNetworkCreateInput, ctx: ProcedureContext): Promise<DockerNetworkCreateOutput> {
  const args = ["network", "create"];
  if (input.driver) args.push("--driver", input.driver);
  if (input.internal) args.push("--internal");
  args.push(...labelArgs(input.labels));
  args.push(dockerArg("network", input.name));
  return runDocker(args, input, ctx);
}
