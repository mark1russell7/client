/**
 * docker.exec procedure
 *
 * Execute command in a running container.
 */

import type { ProcedureContext } from "@procedures/client";
import { commandWords, dockerArg, runDocker } from "./shared.js";
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
    // The command: args as they are, or command split at whitespace
    const command = commandWords(input);
    if (command.length === 0) {
      throw new Error("docker.exec needs command or args");
    }
    args.push(...command);

    return runDocker(args, input, ctx);
  }
}
