/**
 * docker.compose.down procedure
 *
 * Stop services with docker compose.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { runDocker } from "./shared.js";
import type { DockerComposeDownInput, DockerCommandOutput } from "../../types.js";

/**
 * Stop services with docker compose
 */
export async function dockerComposeDown(
  input: DockerComposeDownInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  {
    const args: string[] = ["compose"];

    if (input.file) args.push("-f", input.file);

    args.push("down");

    if (input.volumes) args.push("-v");
    if (input.removeOrphans) args.push("--remove-orphans");
    if (input.rmi) args.push("--rmi", input.rmi);

    return runDocker(args, input, ctx);
  }
}
