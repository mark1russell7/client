/**
 * Type definitions for client-docker procedures
 *
 * client-docker wraps Docker CLI commands as procedures using client-shell.
 */

import { z } from "zod";

// =============================================================================
// Shared Output Type
// =============================================================================

export interface DockerCommandOutput {
  /** Exit code of the command */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether command succeeded (exit code 0) */
  success: boolean;
  /** Duration in milliseconds */
  duration: number;
}

/** One item of a followed log: a line of the container, or the end of `docker logs` (the last item). */
export type DockerLogItem =
  | { type: "stdout" | "stderr"; line: string }
  | {
      type: "exit";
      exitCode: number;
      duration: number;
      signal?: string | undefined;
      timedOut?: boolean | undefined;
      aborted?: boolean | undefined;
    };

// Output schemas (roadmap 2.1). Loose objects: a field that a schema does not name stays in the
// result (a strict schema would remove it when the output is validated).

/** The result of a docker command: every docker.* procedure gives it. */
export const DockerCommandOutputSchema: z.ZodType<DockerCommandOutput> = z.looseObject({
  exitCode: z.number().describe("The exit code of docker (0 is success)"),
  stdout: z.string().describe("The standard output of docker"),
  stderr: z.string().describe("The standard error of docker, or the error message when docker did not start"),
  success: z.boolean().describe("True when the exit code is 0"),
  duration: z.number().describe("The time of the command, in milliseconds"),
});

/** docker.logs: one result, or with follow a stream of lines and one last exit item. */
export const DockerLogsOutputSchema: z.ZodType<DockerCommandOutput | DockerLogItem> = z.union([
  DockerCommandOutputSchema,
  z.looseObject({
    type: z.enum(["stdout", "stderr"]).describe("The stream of the line"),
    line: z.string().describe("One line of the log, without its line end"),
  }),
  z.looseObject({
    type: z.literal("exit").describe("The end of the stream"),
    exitCode: z.number().describe("The exit code of docker logs"),
    duration: z.number().describe("The time of the stream, in milliseconds"),
    signal: z.string().optional().describe("The signal that ended docker logs"),
    timedOut: z.boolean().optional().describe("True when the timeout ended the stream"),
    aborted: z.boolean().optional().describe("True when the reader or the signal ended the stream"),
  }),
]);

// =============================================================================
// docker.run Types
// =============================================================================

export const DockerRunInputSchema: z.ZodObject<{
  image: z.ZodString;
  name: z.ZodOptional<z.ZodString>;
  ports: z.ZodOptional<z.ZodArray<z.ZodString>>;
  volumes: z.ZodOptional<z.ZodArray<z.ZodString>>;
  env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  detach: z.ZodOptional<z.ZodBoolean>;
  rm: z.ZodOptional<z.ZodBoolean>;
  command: z.ZodOptional<z.ZodString>;
  args: z.ZodOptional<z.ZodArray<z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Docker image to run */
  image: z.string().describe("Docker image to run"),
  /** Container name */
  name: z.string().optional().describe("Container name"),
  /** Port mappings (e.g., ["8080:80", "3000:3000"]) */
  ports: z.array(z.string()).optional().describe("Port mappings (e.g., [\"8080:80\", \"3000:3000\"])"),
  /** Volume mappings (e.g., ["/host:/container"]) */
  volumes: z.array(z.string()).optional().describe("Volume mappings (e.g., [\"/host:/container\"])"),
  /** Environment variables */
  env: z.record(z.string(), z.string()).optional().describe("Environment variables"),
  /** Run in detached mode */
  detach: z.boolean().optional().describe("Run in detached mode"),
  /** Automatically remove container when it exits */
  rm: z.boolean().optional().describe("Automatically remove container when it exits"),
  /** Command to run in container: split at whitespace, so it cannot hold quoted text */
  command: z.string().optional().describe("Command to run in container, split at whitespace. For an argument with spaces, use args"),
  /** The command as a list: each item is one argument. It replaces `command` (roadmap R41). */
  args: z.array(z.string()).optional().describe("The command as a list of arguments, each one as it is (not with command)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type DockerRunInput = z.infer<typeof DockerRunInputSchema>;

// =============================================================================
// docker.build Types
// =============================================================================

export const DockerBuildInputSchema: z.ZodObject<{
  context: z.ZodString;
  tag: z.ZodString;
  dockerfile: z.ZodOptional<z.ZodString>;
  buildArgs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  noCache: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Build context path */
  context: z.string().describe("Build context path"),
  /** Image tag */
  tag: z.string().describe("Image tag"),
  /** Dockerfile path (relative to context) */
  dockerfile: z.string().optional().describe("Dockerfile path (relative to context)"),
  /** Build arguments */
  buildArgs: z.record(z.string(), z.string()).optional().describe("Build arguments"),
  /** Do not use cache when building */
  noCache: z.boolean().optional().describe("Do not use cache when building"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type DockerBuildInput = z.infer<typeof DockerBuildInputSchema>;

// =============================================================================
// docker.pull Types
// =============================================================================

export const DockerPullInputSchema: z.ZodObject<{
  image: z.ZodString;
  tag: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Image to pull */
  image: z.string().describe("Image to pull"),
  /** Image tag (default: latest) */
  tag: z.string().optional().describe("Image tag (default: latest)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type DockerPullInput = z.infer<typeof DockerPullInputSchema>;

// =============================================================================
// docker.exec Types
// =============================================================================

export const DockerExecInputSchema: z.ZodObject<{
  container: z.ZodString;
  command: z.ZodOptional<z.ZodString>;
  args: z.ZodOptional<z.ZodArray<z.ZodString>>;
  interactive: z.ZodOptional<z.ZodBoolean>;
  tty: z.ZodOptional<z.ZodBoolean>;
  workdir: z.ZodOptional<z.ZodString>;
  env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Container name or ID */
  container: z.string().describe("Container name or ID"),
  /** Command to execute: split at whitespace, so it cannot hold quoted text */
  command: z.string().optional().describe("Command to execute, split at whitespace. For an argument with spaces, use args"),
  /** The command as a list: each item is one argument. Give `command` or `args` (roadmap R41). */
  args: z.array(z.string()).optional().describe("The command as a list of arguments, each one as it is (not with command)"),
  /** Run interactively */
  interactive: z.boolean().optional().describe("Run interactively"),
  /** Allocate a TTY */
  tty: z.boolean().optional().describe("Allocate a TTY"),
  /** Working directory inside container */
  workdir: z.string().optional().describe("Working directory inside container"),
  /** Environment variables */
  env: z.record(z.string(), z.string()).optional().describe("Environment variables"),
  /** Working directory (host) */
  cwd: z.string().optional().describe("Working directory (host)"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type DockerExecInput = z.infer<typeof DockerExecInputSchema>;

// =============================================================================
// docker.stop Types
// =============================================================================

export const DockerStopInputSchema: z.ZodObject<{
  containers: z.ZodArray<z.ZodString>;
  time: z.ZodOptional<z.ZodNumber>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Container name(s) or ID(s) */
  containers: z.array(z.string()).describe("Container name(s) or ID(s)"),
  /** Seconds to wait before killing */
  time: z.number().optional().describe("Seconds to wait before killing"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type DockerStopInput = z.infer<typeof DockerStopInputSchema>;

// =============================================================================
// docker.rm Types
// =============================================================================

export const DockerRmInputSchema: z.ZodObject<{
  containers: z.ZodArray<z.ZodString>;
  force: z.ZodOptional<z.ZodBoolean>;
  volumes: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Container name(s) or ID(s) */
  containers: z.array(z.string()).describe("Container name(s) or ID(s)"),
  /** Force removal */
  force: z.boolean().optional().describe("Force removal"),
  /** Remove volumes */
  volumes: z.boolean().optional().describe("Remove volumes"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type DockerRmInput = z.infer<typeof DockerRmInputSchema>;

// =============================================================================
// docker.ps Types
// =============================================================================

export const DockerPsInputSchema: z.ZodObject<{
  all: z.ZodOptional<z.ZodBoolean>;
  filter: z.ZodOptional<z.ZodString>;
  format: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Show all containers (default shows just running) */
  all: z.boolean().optional().describe("Show all containers (default shows just running)"),
  /** Filter containers */
  filter: z.string().optional().describe("Filter containers"),
  /** Format output */
  format: z.string().optional().describe("Format output"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type DockerPsInput = z.infer<typeof DockerPsInputSchema>;

// =============================================================================
// docker.logs Types
// =============================================================================

export const DockerLogsInputSchema: z.ZodObject<{
  container: z.ZodString;
  follow: z.ZodOptional<z.ZodBoolean>;
  tail: z.ZodOptional<z.ZodNumber>;
  timestamps: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Container name or ID */
  container: z.string().describe("Container name or ID"),
  /** Follow log output */
  follow: z.boolean().optional().describe("Follow log output"),
  /** Number of lines from end */
  tail: z.number().optional().describe("Number of lines from end"),
  /** Show timestamps */
  timestamps: z.boolean().optional().describe("Show timestamps"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type DockerLogsInput = z.infer<typeof DockerLogsInputSchema>;

// =============================================================================
// docker.compose.up Types
// =============================================================================

export const DockerComposeUpInputSchema: z.ZodObject<{
  file: z.ZodOptional<z.ZodString>;
  services: z.ZodOptional<z.ZodArray<z.ZodString>>;
  detach: z.ZodOptional<z.ZodBoolean>;
  build: z.ZodOptional<z.ZodBoolean>;
  forceRecreate: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Compose file path */
  file: z.string().optional().describe("Compose file path"),
  /** Services to start (default: all) */
  services: z.array(z.string()).optional().describe("Services to start (default: all)"),
  /** Detached mode */
  detach: z.boolean().optional().describe("Detached mode"),
  /** Build images before starting */
  build: z.boolean().optional().describe("Build images before starting"),
  /** Force recreate containers */
  forceRecreate: z.boolean().optional().describe("Force recreate containers"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type DockerComposeUpInput = z.infer<typeof DockerComposeUpInputSchema>;

// =============================================================================
// docker.compose.down Types
// =============================================================================

export const DockerComposeDownInputSchema: z.ZodObject<{
  file: z.ZodOptional<z.ZodString>;
  volumes: z.ZodOptional<z.ZodBoolean>;
  removeOrphans: z.ZodOptional<z.ZodBoolean>;
  rmi: z.ZodOptional<z.ZodEnum<{ all: "all"; local: "local" }>>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Compose file path */
  file: z.string().optional().describe("Compose file path"),
  /** Remove volumes */
  volumes: z.boolean().optional().describe("Remove volumes"),
  /** Remove orphan containers */
  removeOrphans: z.boolean().optional().describe("Remove orphan containers"),
  /** Remove images (all, local) */
  rmi: z.enum(["all", "local"]).optional().describe("Remove images (all, local)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
  /** Timeout in milliseconds */
  timeout: z.number().optional().describe("Timeout in milliseconds"),
});

export type DockerComposeDownInput = z.infer<typeof DockerComposeDownInputSchema>;

// =============================================================================
// Roadmap R41: the fields that several procedures share
// =============================================================================

const COMPOSE_FILE = z.string().optional().describe("Compose file path");
const SERVICES = z.array(z.string()).optional().describe("The services (default: all)");
const CWD = z.string().optional().describe("Working directory");
const TIMEOUT = z.number().optional().describe("Timeout in milliseconds");
const FILTER = z.string().optional().describe("A filter of docker, for example label=app or dangling=true");
const FORMAT = z.string().optional().describe("A Go template or json for the output (--format)");
const LABELS = z.record(z.string(), z.string()).optional().describe("Labels");

// =============================================================================
// docker.compose.ps Types - The containers of a compose project (roadmap R41)
// =============================================================================

export const DockerComposePsInputSchema: z.ZodObject<{
  file: z.ZodOptional<z.ZodString>;
  services: z.ZodOptional<z.ZodArray<z.ZodString>>;
  all: z.ZodOptional<z.ZodBoolean>;
  format: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  file: COMPOSE_FILE,
  services: SERVICES,
  all: z.boolean().optional().describe("Also the stopped containers"),
  format: FORMAT,
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerComposePsInput = z.infer<typeof DockerComposePsInputSchema>;

// =============================================================================
// docker.compose.logs Types - The logs of the services (roadmap R41)
// =============================================================================

export const DockerComposeLogsInputSchema: z.ZodObject<{
  file: z.ZodOptional<z.ZodString>;
  services: z.ZodOptional<z.ZodArray<z.ZodString>>;
  tail: z.ZodOptional<z.ZodNumber>;
  since: z.ZodOptional<z.ZodString>;
  timestamps: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  file: COMPOSE_FILE,
  services: SERVICES,
  tail: z.number().int().min(0).optional().describe("The number of lines from the end of each log"),
  since: z.string().optional().describe("Only the logs after this time, for example 10m or 2026-10-16T10:00:00"),
  timestamps: z.boolean().optional().describe("Show timestamps"),
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerComposeLogsInput = z.infer<typeof DockerComposeLogsInputSchema>;

// =============================================================================
// docker.compose.build Types - The images of the services (roadmap R41)
// =============================================================================

export const DockerComposeBuildInputSchema: z.ZodObject<{
  file: z.ZodOptional<z.ZodString>;
  services: z.ZodOptional<z.ZodArray<z.ZodString>>;
  noCache: z.ZodOptional<z.ZodBoolean>;
  pull: z.ZodOptional<z.ZodBoolean>;
  buildArgs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  file: COMPOSE_FILE,
  services: SERVICES,
  noCache: z.boolean().optional().describe("Do not use cache when building"),
  pull: z.boolean().optional().describe("Pull newer versions of the base images"),
  buildArgs: z.record(z.string(), z.string()).optional().describe("Build arguments"),
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerComposeBuildInput = z.infer<typeof DockerComposeBuildInputSchema>;

// =============================================================================
// docker.compose.restart Types - Restart the services (roadmap R41)
// =============================================================================

export const DockerComposeRestartInputSchema: z.ZodObject<{
  file: z.ZodOptional<z.ZodString>;
  services: z.ZodOptional<z.ZodArray<z.ZodString>>;
  time: z.ZodOptional<z.ZodNumber>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  file: COMPOSE_FILE,
  services: SERVICES,
  time: z.number().int().min(0).optional().describe("Seconds to wait for the stop before killing"),
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerComposeRestartInput = z.infer<typeof DockerComposeRestartInputSchema>;

// =============================================================================
// docker.images Types - List images (roadmap R41)
// =============================================================================

export const DockerImagesInputSchema: z.ZodObject<{
  repository: z.ZodOptional<z.ZodString>;
  all: z.ZodOptional<z.ZodBoolean>;
  filter: z.ZodOptional<z.ZodString>;
  format: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  repository: z.string().optional().describe("Only the images of this repository, for example nginx or nginx:1.27"),
  all: z.boolean().optional().describe("Also the intermediate images"),
  filter: FILTER,
  format: FORMAT,
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerImagesInput = z.infer<typeof DockerImagesInputSchema>;

// =============================================================================
// docker.inspect Types - The details of objects as JSON (roadmap R41)
// =============================================================================

export const DockerInspectInputSchema: z.ZodObject<{
  targets: z.ZodArray<z.ZodString>;
  type: z.ZodOptional<z.ZodEnum<{ container: "container"; image: "image"; volume: "volume"; network: "network" }>>;
  format: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  targets: z.array(z.string()).min(1).describe("The names or the IDs of the objects"),
  type: z.enum(["container", "image", "volume", "network"]).optional().describe("The type of the objects (default: any type)"),
  format: z.string().optional().describe("A Go template for the output. Without it, the output is JSON, and data has it"),
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerInspectInput = z.infer<typeof DockerInspectInputSchema>;

/** The result of docker.inspect: `data` is the parsed JSON of docker, without `format`. */
export interface DockerInspectOutput extends DockerCommandOutput {
  data?: unknown;
}

// =============================================================================
// docker.volume.* Types - Volumes (roadmap R41)
// =============================================================================

export const DockerVolumeListInputSchema: z.ZodObject<{
  filter: z.ZodOptional<z.ZodString>;
  format: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  filter: FILTER,
  format: FORMAT,
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerVolumeListInput = z.infer<typeof DockerVolumeListInputSchema>;

export const DockerVolumeCreateInputSchema: z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  driver: z.ZodOptional<z.ZodString>;
  labels: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  name: z.string().optional().describe("The volume name (default: a random name)"),
  driver: z.string().optional().describe("The volume driver (default: local)"),
  labels: LABELS,
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerVolumeCreateInput = z.infer<typeof DockerVolumeCreateInputSchema>;

export const DockerVolumeRemoveInputSchema: z.ZodObject<{
  volumes: z.ZodArray<z.ZodString>;
  force: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  volumes: z.array(z.string()).min(1).describe("The volume names. Their data is lost"),
  force: z.boolean().optional().describe("Force removal"),
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerVolumeRemoveInput = z.infer<typeof DockerVolumeRemoveInputSchema>;

// =============================================================================
// docker.network.* Types - Networks (roadmap R41)
// =============================================================================

export const DockerNetworkListInputSchema: z.ZodObject<{
  filter: z.ZodOptional<z.ZodString>;
  format: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  filter: FILTER,
  format: FORMAT,
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerNetworkListInput = z.infer<typeof DockerNetworkListInputSchema>;

export const DockerNetworkCreateInputSchema: z.ZodObject<{
  name: z.ZodString;
  driver: z.ZodOptional<z.ZodString>;
  internal: z.ZodOptional<z.ZodBoolean>;
  labels: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  name: z.string().describe("The network name"),
  driver: z.string().optional().describe("The network driver (default: bridge)"),
  internal: z.boolean().optional().describe("No access to networks outside the host"),
  labels: LABELS,
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerNetworkCreateInput = z.infer<typeof DockerNetworkCreateInputSchema>;

export const DockerNetworkRemoveInputSchema: z.ZodObject<{
  networks: z.ZodArray<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  networks: z.array(z.string()).min(1).describe("The network names or IDs"),
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerNetworkRemoveInput = z.infer<typeof DockerNetworkRemoveInputSchema>;

// =============================================================================
// docker.tag and docker.push Types (roadmap R41)
// =============================================================================

export const DockerTagInputSchema: z.ZodObject<{
  source: z.ZodString;
  target: z.ZodString;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  source: z.string().describe("The image, for example app:latest or an image ID"),
  target: z.string().describe("The new name, for example registry.example.com/app:1.0. An image with this name loses it"),
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerTagInput = z.infer<typeof DockerTagInputSchema>;

export const DockerPushInputSchema: z.ZodObject<{
  image: z.ZodString;
  allTags: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  image: z.string().describe("The image, for example registry.example.com/app:1.0"),
  allTags: z.boolean().optional().describe("Push all the tags of the repository"),
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerPushInput = z.infer<typeof DockerPushInputSchema>;

// =============================================================================
// docker.prune Types - Remove unused objects (roadmap R41)
// =============================================================================

export const DockerPruneInputSchema: z.ZodObject<{
  kind: z.ZodOptional<
    z.ZodEnum<{ system: "system"; container: "container"; image: "image"; volume: "volume"; network: "network"; builder: "builder" }>
  >;
  all: z.ZodOptional<z.ZodBoolean>;
  volumes: z.ZodOptional<z.ZodBoolean>;
  filter: z.ZodOptional<z.ZodString>;
  confirm: z.ZodLiteral<true>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  kind: z
    .enum(["system", "container", "image", "volume", "network", "builder"])
    .optional()
    .describe("What to remove. system: the stopped containers, the unused networks, the dangling images and the build cache (default: system)"),
  all: z.boolean().optional().describe("Also the unused images that have a name (image, system, builder), or the named volumes (volume)"),
  volumes: z.boolean().optional().describe("With the kind system: also the unused volumes. Their data is lost"),
  filter: FILTER,
  confirm: z.literal(true).describe("Must be true: the removed objects and their data are lost"),
  cwd: CWD,
  timeout: TIMEOUT,
});

export type DockerPruneInput = z.infer<typeof DockerPruneInputSchema>;

// =============================================================================
// The outputs of the procedures of roadmap R41
// =============================================================================

export type DockerComposePsOutput = DockerCommandOutput;
export type DockerComposeLogsOutput = DockerCommandOutput;
export type DockerComposeBuildOutput = DockerCommandOutput;
export type DockerComposeRestartOutput = DockerCommandOutput;
export type DockerImagesOutput = DockerCommandOutput;
export type DockerVolumeListOutput = DockerCommandOutput;
export type DockerVolumeCreateOutput = DockerCommandOutput;
export type DockerVolumeRemoveOutput = DockerCommandOutput;
export type DockerNetworkListOutput = DockerCommandOutput;
export type DockerNetworkCreateOutput = DockerCommandOutput;
export type DockerNetworkRemoveOutput = DockerCommandOutput;
export type DockerTagOutput = DockerCommandOutput;
export type DockerPushOutput = DockerCommandOutput;
export type DockerPruneOutput = DockerCommandOutput;

export const DockerComposePsOutputSchema: z.ZodType<DockerComposePsOutput> = DockerCommandOutputSchema;
export const DockerComposeLogsOutputSchema: z.ZodType<DockerComposeLogsOutput> = DockerCommandOutputSchema;
export const DockerComposeBuildOutputSchema: z.ZodType<DockerComposeBuildOutput> = DockerCommandOutputSchema;
export const DockerComposeRestartOutputSchema: z.ZodType<DockerComposeRestartOutput> = DockerCommandOutputSchema;
export const DockerImagesOutputSchema: z.ZodType<DockerImagesOutput> = DockerCommandOutputSchema;
export const DockerVolumeListOutputSchema: z.ZodType<DockerVolumeListOutput> = DockerCommandOutputSchema;
export const DockerVolumeCreateOutputSchema: z.ZodType<DockerVolumeCreateOutput> = DockerCommandOutputSchema;
export const DockerVolumeRemoveOutputSchema: z.ZodType<DockerVolumeRemoveOutput> = DockerCommandOutputSchema;
export const DockerNetworkListOutputSchema: z.ZodType<DockerNetworkListOutput> = DockerCommandOutputSchema;
export const DockerNetworkCreateOutputSchema: z.ZodType<DockerNetworkCreateOutput> = DockerCommandOutputSchema;
export const DockerNetworkRemoveOutputSchema: z.ZodType<DockerNetworkRemoveOutput> = DockerCommandOutputSchema;
export const DockerTagOutputSchema: z.ZodType<DockerTagOutput> = DockerCommandOutputSchema;
export const DockerPushOutputSchema: z.ZodType<DockerPushOutput> = DockerCommandOutputSchema;
export const DockerPruneOutputSchema: z.ZodType<DockerPruneOutput> = DockerCommandOutputSchema;

export const DockerInspectOutputSchema: z.ZodType<DockerInspectOutput> = z.looseObject({
  exitCode: z.number().describe("The exit code of docker (0 is success)"),
  stdout: z.string().describe("The standard output of docker"),
  stderr: z.string().describe("The standard error of docker, or the error message when docker did not start"),
  success: z.boolean().describe("True when the exit code is 0"),
  duration: z.number().describe("The time of the command, in milliseconds"),
  data: z.unknown().optional().describe("The parsed JSON of docker: one object for each target"),
});
