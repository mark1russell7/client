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
  /** Command to run in container */
  command: z.string().optional().describe("Command to run in container"),
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
  command: z.ZodString;
  interactive: z.ZodOptional<z.ZodBoolean>;
  tty: z.ZodOptional<z.ZodBoolean>;
  workdir: z.ZodOptional<z.ZodString>;
  env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Container name or ID */
  container: z.string().describe("Container name or ID"),
  /** Command to execute */
  command: z.string().describe("Command to execute"),
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
