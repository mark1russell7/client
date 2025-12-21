/**
 * @mark1russell7/client-docker
 *
 * Wraps Docker CLI commands as procedures using client-shell.
 *
 * @example
 * ```typescript
 * import { Client } from "@mark1russell7/client";
 *
 * // Run a container
 * await client.call(["docker", "run"], {
 *   image: "nginx:latest",
 *   name: "my-nginx",
 *   ports: ["8080:80"],
 *   detach: true,
 * });
 *
 * // Build an image
 * await client.call(["docker", "build"], {
 *   context: ".",
 *   tag: "my-app:latest",
 * });
 *
 * // Docker compose up
 * await client.call(["docker", "compose", "up"], {
 *   detach: true,
 * });
 * ```
 */

// Types
export type {
  DockerRunInput,
  DockerBuildInput,
  DockerPullInput,
  DockerExecInput,
  DockerStopInput,
  DockerRmInput,
  DockerPsInput,
  DockerLogsInput,
  DockerComposeUpInput,
  DockerComposeDownInput,
  DockerCommandOutput,
} from "./types.js";

export {
  DockerRunInputSchema,
  DockerBuildInputSchema,
  DockerPullInputSchema,
  DockerExecInputSchema,
  DockerStopInputSchema,
  DockerRmInputSchema,
  DockerPsInputSchema,
  DockerLogsInputSchema,
  DockerComposeUpInputSchema,
  DockerComposeDownInputSchema,
} from "./types.js";

// Procedures
export {
  dockerRun,
  dockerBuild,
  dockerPull,
  dockerExec,
  dockerStop,
  dockerRm,
  dockerPs,
  dockerLogs,
  dockerComposeUp,
  dockerComposeDown,
} from "./procedures/docker/index.js";

// Registration
export { registerDockerProcedures } from "./register.js";
