/**
 * docker.run procedure
 *
 * Run a Docker container.
 */

import type { ProcedureContext } from "@procedures/client";
import { commandWords, dockerArg, runDocker } from "./shared.js";
import type { DockerRunInput, DockerCommandOutput } from "../../types.js";

/**
 * Run a Docker container
 *
 * @example
 * // Run nginx in detached mode
 * await client.call(["docker", "run"], {
 *   image: "nginx:latest",
 *   name: "my-nginx",
 *   ports: ["8080:80"],
 *   detach: true,
 * });
 */
export async function dockerRun(
  input: DockerRunInput,
  ctx: ProcedureContext
): Promise<DockerCommandOutput> {
  {
    const args: string[] = ["run"];

    // Add flags
    if (input.detach) args.push("-d");
    if (input.rm) args.push("--rm");
    if (input.name) args.push("--name", input.name);

    // Add port mappings
    if (input.ports) {
      for (const port of input.ports) {
        args.push("-p", port);
      }
    }

    // Add volume mappings
    if (input.volumes) {
      for (const volume of input.volumes) {
        args.push("-v", volume);
      }
    }

    // Add environment variables
    if (input.env) {
      for (const [key, value] of Object.entries(input.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    // Add image
    args.push(dockerArg("image", input.image));

    // Add the command: args as they are, or command split at whitespace
    args.push(...commandWords(input));
    return runDocker(args, input, ctx);
  }
}
