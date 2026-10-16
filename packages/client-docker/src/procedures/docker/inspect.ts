/**
 * docker.inspect procedure
 *
 * Give the details of containers, images, volumes or networks as JSON (roadmap R41). Without
 * `format`, docker writes a JSON array, and `data` has it parsed.
 */

import type { ProcedureContext } from "@procedures/client";
import { dockerArg, runDocker } from "./shared.js";
import type { DockerInspectInput, DockerInspectOutput } from "../../types.js";

/**
 * Give the details of containers, images, volumes or networks as JSON
 */
export async function dockerInspect(input: DockerInspectInput, ctx: ProcedureContext): Promise<DockerInspectOutput> {
  const args = ["inspect"];
  if (input.type) args.push("--type", input.type);
  if (input.format) args.push("--format", input.format);
  args.push(...input.targets.map((target) => dockerArg("target", target)));

  const result: DockerInspectOutput = await runDocker(args, input, ctx);
  // Docker writes the array also when a target is missing (exit 1): the found ones are in it
  if (!input.format && result.stdout.trim().startsWith("[")) {
    try {
      result.data = JSON.parse(result.stdout);
    } catch {
      // Not JSON: stdout has the text
    }
  }
  return result;
}
