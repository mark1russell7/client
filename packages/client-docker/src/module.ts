/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for Docker operations
 *
 * Provides docker.run, docker.build, docker.pull, docker.exec, docker.stop,
 * docker.rm, docker.ps, docker.logs, docker.compose.up, docker.compose.down procedures.
 */


import { createProcedure, zodAdapter, defineModule, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import shellModule from "@procedures/shell/module";
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
import type { DockerLogItem } from "./procedures/docker/index.js";
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
  DockerCommandOutputSchema,
  DockerLogsOutputSchema,
} from "./types.js";
import type { ProcedureContext } from "@procedures/client";

// =============================================================================
// Procedures
// =============================================================================

const dockerRunProcedure = createProcedure()
  .path(["docker", "run"])
  .input(zodAdapter<DockerRunInput>(DockerRunInputSchema))
  .output(zodAdapter<DockerCommandOutput>(DockerCommandOutputSchema))
  .meta({
    description: "Run a Docker container",
    calls: ["shell.run"],
    // The container runs the image and command of the caller. The volumes give it host files, and
    // docker pulls a missing image.
    effects: { reads: ["docker", "fs", "network"], writes: ["docker", "fs", "process"] },
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
  .output(zodAdapter<DockerCommandOutput>(DockerCommandOutputSchema))
  .meta({
    description: "Build a Docker image",
    calls: ["shell.run"],
    // The RUN steps of the Dockerfile are code of the project. Docker reads the context and pulls
    // the base images. The tag goes to the new image, and the earlier image stays.
    effects: { reads: ["docker", "fs", "network"], writes: ["docker", "process"], destructive: false },
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
  .output(zodAdapter<DockerCommandOutput>(DockerCommandOutputSchema))
  .meta({
    description: "Pull a Docker image",
    calls: ["shell.run"],
    effects: { reads: ["docker", "network"], writes: ["docker"], destructive: false, idempotent: true },
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
  .output(zodAdapter<DockerCommandOutput>(DockerCommandOutputSchema))
  .meta({
    description: "Execute command in a running container",
    calls: ["shell.run"],
    // The container runs the command of the caller
    effects: { reads: ["docker"], writes: ["docker", "process"] },
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
  .output(zodAdapter<DockerCommandOutput>(DockerCommandOutputSchema))
  .meta({
    description: "Stop running container(s)",
    calls: ["shell.run"],
    // The stop of a stopped container changes nothing
    effects: { reads: ["docker"], writes: ["docker"], idempotent: true },
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
  .output(zodAdapter<DockerCommandOutput>(DockerCommandOutputSchema))
  .meta({
    description: "Remove container(s)",
    calls: ["shell.run"],
    effects: { reads: ["docker"], writes: ["docker"] },
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
  .output(zodAdapter<DockerCommandOutput>(DockerCommandOutputSchema))
  .meta({
    description: "List containers",
    calls: ["shell.run"],
    effects: { reads: ["docker"], writes: [] },
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
  // One value, or with follow one item for each log line (a stream)
  .output(zodAdapter<DockerCommandOutput | DockerLogItem>(DockerLogsOutputSchema))
  .meta({
    description: "Get container logs",
    calls: ["shell.run", "shell.stream"],
    effects: { reads: ["docker"], writes: [] },
    args: ["container"],
    shorts: { follow: "f", tail: "n", timestamps: "t" },
    output: "json",
  })
  // With follow, the promise gives a stream: invokeProcedure reads a returned async iterable as a
  // stream, and the handler types of the core do not describe that case
  .handler((input: DockerLogsInput, ctx: ProcedureContext) =>
    dockerLogs(input, ctx) as unknown as Promise<DockerCommandOutput | DockerLogItem>
  )
  .build();

const dockerComposeUpProcedure = createProcedure()
  .path(["docker", "compose", "up"])
  .input(zodAdapter<DockerComposeUpInput>(DockerComposeUpInputSchema))
  .output(zodAdapter<DockerCommandOutput>(DockerCommandOutputSchema))
  .meta({
    description: "Start services with docker compose",
    calls: ["shell.run"],
    // The compose file of the caller sets the images, the commands and the host folders of the
    // services. An up can replace the containers of changed services.
    effects: { reads: ["docker", "fs", "network"], writes: ["docker", "fs", "process"] },
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
  .output(zodAdapter<DockerCommandOutput>(DockerCommandOutputSchema))
  .meta({
    description: "Stop services with docker compose",
    calls: ["shell.run"],
    // It removes the containers of the project, and with volumes: true its volumes. A second down
    // changes nothing.
    effects: { reads: ["docker", "fs"], writes: ["docker"], idempotent: true },
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

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const dockerModule: ProcedureModule = defineModule("@procedures/docker", [
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
  ], [shellModule]);

export default dockerModule;

/**
 * This function registers the procedures of @procedures/docker, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerDockerProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [dockerModule]);
}
