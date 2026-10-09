/**
 * docker.exec procedure
 *
 * Execute command in a running container.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { dockerArg, runDocker, words } from "./shared.js";
import type { DockerExecInput, DockerCommandOutput } from "../../types.js";

/**
 * Execute command in container
 */
export async function dockerExec(
  input: DockerExecInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  {
    const args: string[] = ["exec"];

    if (input.interactive) args.push("-i");
    if (input.tty) args.push("-t");
    if (input.workdir) args.push("-w", input.workdir);

    // Add environment variables
    if (input.env) {
      for (const [key, value] of Object.entries(input.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    args.push(dockerArg("container", input.container));
    args.push(...words(input.command));

    return runDocker(args, input, ctx);
  }
}
