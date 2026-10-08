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
  image: z.string(),
  /** Container name */
  name: z.string().optional(),
  /** Port mappings (e.g., ["8080:80", "3000:3000"]) */
  ports: z.array(z.string()).optional(),
  /** Volume mappings (e.g., ["/host:/container"]) */
  volumes: z.array(z.string()).optional(),
  /** Environment variables */
  env: z.record(z.string()).optional(),
  /** Run in detached mode */
  detach: z.boolean().optional(),
  /** Automatically remove container when it exits */
  rm: z.boolean().optional(),
  /** Command to run in container */
  command: z.string().optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
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
  context: z.string(),
  /** Image tag */
  tag: z.string(),
  /** Dockerfile path (relative to context) */
  dockerfile: z.string().optional(),
  /** Build arguments */
  buildArgs: z.record(z.string()).optional(),
  /** Do not use cache when building */
  noCache: z.boolean().optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
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
  image: z.string(),
  /** Image tag (default: latest) */
  tag: z.string().optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
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
  container: z.string(),
  /** Command to execute */
  command: z.string(),
  /** Run interactively */
  interactive: z.boolean().optional(),
  /** Allocate a TTY */
  tty: z.boolean().optional(),
  /** Working directory inside container */
  workdir: z.string().optional(),
  /** Environment variables */
  env: z.record(z.string()).optional(),
  /** Working directory (host) */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
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
  containers: z.array(z.string()),
  /** Seconds to wait before killing */
  time: z.number().optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
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
  containers: z.array(z.string()),
  /** Force removal */
  force: z.boolean().optional(),
  /** Remove volumes */
  volumes: z.boolean().optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
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
  all: z.boolean().optional(),
  /** Filter containers */
  filter: z.string().optional(),
  /** Format output */
  format: z.string().optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
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
  container: z.string(),
  /** Follow log output */
  follow: z.boolean().optional(),
  /** Number of lines from end */
  tail: z.number().optional(),
  /** Show timestamps */
  timestamps: z.boolean().optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
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
  file: z.string().optional(),
  /** Services to start (default: all) */
  services: z.array(z.string()).optional(),
  /** Detached mode */
  detach: z.boolean().optional(),
  /** Build images before starting */
  build: z.boolean().optional(),
  /** Force recreate containers */
  forceRecreate: z.boolean().optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
});

export type DockerComposeUpInput = z.infer<typeof DockerComposeUpInputSchema>;

// =============================================================================
// docker.compose.down Types
// =============================================================================

export const DockerComposeDownInputSchema: z.ZodObject<{
  file: z.ZodOptional<z.ZodString>;
  volumes: z.ZodOptional<z.ZodBoolean>;
  removeOrphans: z.ZodOptional<z.ZodBoolean>;
  rmi: z.ZodOptional<z.ZodEnum<["all", "local"]>>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  /** Compose file path */
  file: z.string().optional(),
  /** Remove volumes */
  volumes: z.boolean().optional(),
  /** Remove orphan containers */
  removeOrphans: z.boolean().optional(),
  /** Remove images (all, local) */
  rmi: z.enum(["all", "local"]).optional(),
  /** Working directory */
  cwd: z.string().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
});

export type DockerComposeDownInput = z.infer<typeof DockerComposeDownInputSchema>;
