/**
 * @procedures/docker
 *
 * Wraps Docker CLI commands as procedures using client-shell.
 *
 * @example
 * ```typescript
 * import { Client } from "@procedures/client";
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
  DockerComposePsInput,
  DockerComposeLogsInput,
  DockerComposeBuildInput,
  DockerComposeRestartInput,
  DockerImagesInput,
  DockerInspectInput,
  DockerInspectOutput,
  DockerVolumeListInput,
  DockerVolumeCreateInput,
  DockerVolumeRemoveInput,
  DockerNetworkListInput,
  DockerNetworkCreateInput,
  DockerNetworkRemoveInput,
  DockerTagInput,
  DockerPushInput,
  DockerPruneInput,
} from "./types.js";
export type { DockerLogItem } from "./procedures/docker/logs.js";

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
  DockerComposePsInputSchema,
  DockerComposeLogsInputSchema,
  DockerComposeBuildInputSchema,
  DockerComposeRestartInputSchema,
  DockerImagesInputSchema,
  DockerInspectInputSchema,
  DockerVolumeListInputSchema,
  DockerVolumeCreateInputSchema,
  DockerVolumeRemoveInputSchema,
  DockerNetworkListInputSchema,
  DockerNetworkCreateInputSchema,
  DockerNetworkRemoveInputSchema,
  DockerTagInputSchema,
  DockerPushInputSchema,
  DockerPruneInputSchema,
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
  dockerComposePs,
  dockerComposeLogs,
  dockerComposeBuild,
  dockerComposeRestart,
  dockerImages,
  dockerInspect,
  dockerVolumeList,
  dockerVolumeCreate,
  dockerVolumeRemove,
  dockerNetworkList,
  dockerNetworkCreate,
  dockerNetworkRemove,
  dockerTag,
  dockerPush,
  dockerPrune,
} from "./procedures/docker/index.js";

// Registration
export { registerDockerProcedures } from "./module.js";
