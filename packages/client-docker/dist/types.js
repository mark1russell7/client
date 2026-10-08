/**
 * Type definitions for client-docker procedures
 *
 * client-docker wraps Docker CLI commands as procedures using client-shell.
 */
import { z } from "zod";
// =============================================================================
// docker.run Types
// =============================================================================
export const DockerRunInputSchema = z.object({
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
// =============================================================================
// docker.build Types
// =============================================================================
export const DockerBuildInputSchema = z.object({
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
// =============================================================================
// docker.pull Types
// =============================================================================
export const DockerPullInputSchema = z.object({
    /** Image to pull */
    image: z.string(),
    /** Image tag (default: latest) */
    tag: z.string().optional(),
    /** Working directory */
    cwd: z.string().optional(),
    /** Timeout in milliseconds */
    timeout: z.number().optional(),
});
// =============================================================================
// docker.exec Types
// =============================================================================
export const DockerExecInputSchema = z.object({
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
// =============================================================================
// docker.stop Types
// =============================================================================
export const DockerStopInputSchema = z.object({
    /** Container name(s) or ID(s) */
    containers: z.array(z.string()),
    /** Seconds to wait before killing */
    time: z.number().optional(),
    /** Working directory */
    cwd: z.string().optional(),
    /** Timeout in milliseconds */
    timeout: z.number().optional(),
});
// =============================================================================
// docker.rm Types
// =============================================================================
export const DockerRmInputSchema = z.object({
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
// =============================================================================
// docker.ps Types
// =============================================================================
export const DockerPsInputSchema = z.object({
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
// =============================================================================
// docker.logs Types
// =============================================================================
export const DockerLogsInputSchema = z.object({
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
// =============================================================================
// docker.compose.up Types
// =============================================================================
export const DockerComposeUpInputSchema = z.object({
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
// =============================================================================
// docker.compose.down Types
// =============================================================================
export const DockerComposeDownInputSchema = z.object({
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
//# sourceMappingURL=types.js.map