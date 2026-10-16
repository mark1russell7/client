/**
 * docker.prune procedure
 *
 * Remove unused containers, images, volumes, networks or build cache (roadmap R41). The removed
 * objects and their data are lost, so the input must have `confirm: true`. Docker does not ask:
 * the procedure passes `--force`.
 */

import type { ProcedureContext } from "@procedures/client";
import { runDocker } from "./shared.js";
import type { DockerPruneInput, DockerPruneOutput } from "../../types.js";

/**
 * Remove unused containers, images, volumes, networks or build cache
 */
export async function dockerPrune(input: DockerPruneInput, ctx: ProcedureContext): Promise<DockerPruneOutput> {
  // The schema requires it. A direct call of this function gets the same check.
  if (input.confirm !== true) {
    throw new Error("docker.prune needs confirm: true. The removed objects and their data are lost");
  }
  const kind = input.kind ?? "system";
  if (input.volumes && kind !== "system") {
    throw new Error(`docker.prune: volumes needs the kind system, not ${kind}`);
  }
  const args = [kind, "prune", "--force"];
  if (input.all) args.push("--all");
  if (input.volumes) args.push("--volumes");
  if (input.filter) args.push("--filter", input.filter);
  return runDocker(args, input, ctx);
}
