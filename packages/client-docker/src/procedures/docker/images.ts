/**
 * docker.images procedure
 *
 * List images (roadmap R41).
 */

import type { ProcedureContext } from "@procedures/client";
import { dockerArg, runDocker } from "./shared.js";
import type { DockerImagesInput, DockerImagesOutput } from "../../types.js";

/**
 * List images
 */
export async function dockerImages(input: DockerImagesInput, ctx: ProcedureContext): Promise<DockerImagesOutput> {
  const args = ["images"];
  if (input.all) args.push("--all");
  if (input.filter) args.push("--filter", input.filter);
  if (input.format) args.push("--format", input.format);
  if (input.repository) args.push(dockerArg("repository", input.repository));
  return runDocker(args, input, ctx);
}
