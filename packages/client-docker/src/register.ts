/**
 * Procedure Registration for Docker operations
 *
 * Provides docker.run, docker.build, docker.pull, docker.exec, docker.stop,
 * docker.rm, docker.ps, docker.logs, docker.compose.up, docker.compose.down procedures.
 */

// Import shell dependency to ensure shell.exec is registered
import "@mark1russell7/client-shell";

import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import {
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
import {
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
  type DockerRunInput,
  type DockerBuildInput,
  type DockerPullInput,
  type DockerExecInput,
  type DockerStopInput,
  type DockerRmInput,
  type DockerPsInput,
  type DockerLogsInput,
  type DockerComposeUpInput,
  type DockerComposeDownInput,
  type DockerCommandOutput,
} from "./types.js";
import type { ProcedureContext } from "@mark1russell7/client";

// =============================================================================
// Procedures
// =============================================================================

const dockerRunProcedure = createProcedure()
  .path(["docker", "run"])
  .input(zodAdapter<DockerRunInput>(DockerRunInputSchema))
  .output(outputSchema<DockerCommandOutput>())
  .meta({
    description: "Run a Docker container",
    args: ["image"],
    shorts: { name: "n", detach: "d" },
    output: "json",
  })
  .handler(async (input: DockerRunInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerRun(input, ctx);
  })
  .build();

const dockerBuildProcedure = createProcedure()
  .path(["docker", "build"])
  .input(zodAdapter<DockerBuildInput>(DockerBuildInputSchema))
  .output(outputSchema<DockerCommandOutput>())
  .meta({
    description: "Build a Docker image",
    args: ["context"],
    shorts: { tag: "t", dockerfile: "f" },
    output: "json",
  })
  .handler(async (input: DockerBuildInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerBuild(input, ctx);
  })
  .build();

const dockerPullProcedure = createProcedure()
  .path(["docker", "pull"])
  .input(zodAdapter<DockerPullInput>(DockerPullInputSchema))
  .output(outputSchema<DockerCommandOutput>())
  .meta({
    description: "Pull a Docker image",
    args: ["image"],
    output: "json",
  })
  .handler(async (input: DockerPullInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerPull(input, ctx);
  })
  .build();

const dockerExecProcedure = createProcedure()
  .path(["docker", "exec"])
  .input(zodAdapter<DockerExecInput>(DockerExecInputSchema))
  .output(outputSchema<DockerCommandOutput>())
  .meta({
    description: "Execute command in a running container",
    args: ["container", "command"],
    shorts: { interactive: "i", tty: "t", workdir: "w" },
    output: "json",
  })
  .handler(async (input: DockerExecInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerExec(input, ctx);
  })
  .build();

const dockerStopProcedure = createProcedure()
  .path(["docker", "stop"])
  .input(zodAdapter<DockerStopInput>(DockerStopInputSchema))
  .output(outputSchema<DockerCommandOutput>())
  .meta({
    description: "Stop running container(s)",
    args: ["containers"],
    shorts: { time: "t" },
    output: "json",
  })
  .handler(async (input: DockerStopInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerStop(input, ctx);
  })
  .build();

const dockerRmProcedure = createProcedure()
  .path(["docker", "rm"])
  .input(zodAdapter<DockerRmInput>(DockerRmInputSchema))
  .output(outputSchema<DockerCommandOutput>())
  .meta({
    description: "Remove container(s)",
    args: ["containers"],
    shorts: { force: "f", volumes: "v" },
    output: "json",
  })
  .handler(async (input: DockerRmInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerRm(input, ctx);
  })
  .build();

const dockerPsProcedure = createProcedure()
  .path(["docker", "ps"])
  .input(zodAdapter<DockerPsInput>(DockerPsInputSchema))
  .output(outputSchema<DockerCommandOutput>())
  .meta({
    description: "List containers",
    shorts: { all: "a", filter: "f", format: "F" },
    output: "json",
  })
  .handler(async (input: DockerPsInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerPs(input, ctx);
  })
  .build();

const dockerLogsProcedure = createProcedure()
  .path(["docker", "logs"])
  .input(zodAdapter<DockerLogsInput>(DockerLogsInputSchema))
  .output(outputSchema<DockerCommandOutput>())
  .meta({
    description: "Get container logs",
    args: ["container"],
    shorts: { follow: "f", tail: "n", timestamps: "t" },
    output: "json",
  })
  .handler(async (input: DockerLogsInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerLogs(input, ctx);
  })
  .build();

const dockerComposeUpProcedure = createProcedure()
  .path(["docker", "compose", "up"])
  .input(zodAdapter<DockerComposeUpInput>(DockerComposeUpInputSchema))
  .output(outputSchema<DockerCommandOutput>())
  .meta({
    description: "Start services with docker compose",
    shorts: { file: "f", detach: "d", build: "b" },
    output: "json",
  })
  .handler(async (input: DockerComposeUpInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerComposeUp(input, ctx);
  })
  .build();

const dockerComposeDownProcedure = createProcedure()
  .path(["docker", "compose", "down"])
  .input(zodAdapter<DockerComposeDownInput>(DockerComposeDownInputSchema))
  .output(outputSchema<DockerCommandOutput>())
  .meta({
    description: "Stop services with docker compose",
    shorts: { file: "f", volumes: "v" },
    output: "json",
  })
  .handler(async (input: DockerComposeDownInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerComposeDown(input, ctx);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerDockerProcedures(): void {
  registerProcedures([
    dockerRunProcedure,
    dockerBuildProcedure,
    dockerPullProcedure,
    dockerExecProcedure,
    dockerStopProcedure,
    dockerRmProcedure,
    dockerPsProcedure,
    dockerLogsProcedure,
    dockerComposeUpProcedure,
    dockerComposeDownProcedure,
  ]);
}

// Auto-register
registerDockerProcedures();
