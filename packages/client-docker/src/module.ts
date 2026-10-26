/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for Docker operations
 *
 * Provides docker.run, docker.build, docker.pull, docker.exec, docker.stop,
 * docker.rm, docker.ps, docker.logs, docker.compose.up, docker.compose.down procedures, and since
 * roadmap R41 docker.compose.ps/logs/build/restart, docker.images, docker.inspect,
 * docker.volume.list/create/remove, docker.network.list/create/remove, docker.tag, docker.push
 * and docker.prune.
 */


import { createProcedure, defineModule, type FsRootRules, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
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
import { dockerComposePs } from "./procedures/docker/compose/ps.js";
import { dockerComposeLogs } from "./procedures/docker/compose/logs.js";
import { dockerComposeBuild } from "./procedures/docker/compose/build.js";
import { dockerComposeRestart } from "./procedures/docker/compose/restart.js";
import { dockerImages } from "./procedures/docker/images.js";
import { dockerInspect } from "./procedures/docker/inspect.js";
import { dockerVolumeList } from "./procedures/docker/volume/list.js";
import { dockerVolumeCreate } from "./procedures/docker/volume/create.js";
import { dockerVolumeRemove } from "./procedures/docker/volume/remove.js";
import { dockerNetworkList } from "./procedures/docker/network/list.js";
import { dockerNetworkCreate } from "./procedures/docker/network/create.js";
import { dockerNetworkRemove } from "./procedures/docker/network/remove.js";
import { dockerTag } from "./procedures/docker/tag.js";
import { dockerPush } from "./procedures/docker/push.js";
import { dockerPrune } from "./procedures/docker/prune.js";
import {
  DockerComposePsInputSchema,
  DockerComposePsOutputSchema,
  type DockerComposePsInput,
  type DockerComposePsOutput,
  DockerComposeLogsInputSchema,
  DockerComposeLogsOutputSchema,
  type DockerComposeLogsInput,
  type DockerComposeLogsOutput,
  DockerComposeBuildInputSchema,
  DockerComposeBuildOutputSchema,
  type DockerComposeBuildInput,
  type DockerComposeBuildOutput,
  DockerComposeRestartInputSchema,
  DockerComposeRestartOutputSchema,
  type DockerComposeRestartInput,
  type DockerComposeRestartOutput,
  DockerImagesInputSchema,
  DockerImagesOutputSchema,
  type DockerImagesInput,
  type DockerImagesOutput,
  DockerInspectInputSchema,
  DockerInspectOutputSchema,
  type DockerInspectInput,
  type DockerInspectOutput,
  DockerVolumeListInputSchema,
  DockerVolumeListOutputSchema,
  type DockerVolumeListInput,
  type DockerVolumeListOutput,
  DockerVolumeCreateInputSchema,
  DockerVolumeCreateOutputSchema,
  type DockerVolumeCreateInput,
  type DockerVolumeCreateOutput,
  DockerVolumeRemoveInputSchema,
  DockerVolumeRemoveOutputSchema,
  type DockerVolumeRemoveInput,
  type DockerVolumeRemoveOutput,
  DockerNetworkListInputSchema,
  DockerNetworkListOutputSchema,
  type DockerNetworkListInput,
  type DockerNetworkListOutput,
  DockerNetworkCreateInputSchema,
  DockerNetworkCreateOutputSchema,
  type DockerNetworkCreateInput,
  type DockerNetworkCreateOutput,
  DockerNetworkRemoveInputSchema,
  DockerNetworkRemoveOutputSchema,
  type DockerNetworkRemoveInput,
  type DockerNetworkRemoveOutput,
  DockerTagInputSchema,
  DockerTagOutputSchema,
  type DockerTagInput,
  type DockerTagOutput,
  DockerPushInputSchema,
  DockerPushOutputSchema,
  type DockerPushInput,
  type DockerPushOutput,
  DockerPruneInputSchema,
  DockerPruneOutputSchema,
  type DockerPruneInput,
  type DockerPruneOutput,
} from "./types.js";

// =============================================================================
// The rules under a root of the files (roadmap R33)
// =============================================================================

/**
 * A docker command that reaches the daemon and names no path of the host. Under a root, the docker
 * program runs in a working folder of the root.
 */
const DOCKER_IN_A_ROOT: FsRootRules = { cwd: "cwd" };

/** `docker run`: a root refuses it. */
const RUN_UNDER_A_ROOT: FsRootRules = {
  refuse: "its volumes bind host folders into the container, and the container runs the program of the caller",
};

/** `docker exec`: a root refuses it. */
const EXEC_UNDER_A_ROOT: FsRootRules = {
  refuse: "the container runs the program of the caller, and the container can have host folders",
};

/** `docker build`: a root refuses it. */
const BUILD_UNDER_A_ROOT: FsRootRules = {
  refuse: "the RUN steps of the Dockerfile run programs, and docker resolves the context and the Dockerfile itself",
};

/** The compose commands: a root refuses them. */
const COMPOSE_UNDER_A_ROOT: FsRootRules = {
  refuse: "a compose file can name host folders and files outside the root: bind mounts, env_file, include and extends",
};

// =============================================================================
// Procedures
// =============================================================================

const dockerRunProcedure = createProcedure()
  .path(["docker", "run"])
  .input(DockerRunInputSchema)
  .output(DockerCommandOutputSchema)
  .meta({
    description: "Run a Docker container",
    calls: ["shell.run"],
    // The container runs the image and command of the caller. The volumes give it host files, and
    // docker pulls a missing image.
    effects: { reads: ["docker", "fs", "network"], writes: ["docker", "fs", "process"] },
    fsRoot: RUN_UNDER_A_ROOT,
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
  .input(DockerBuildInputSchema)
  .output(DockerCommandOutputSchema)
  .meta({
    description: "Build a Docker image",
    calls: ["shell.run"],
    // The RUN steps of the Dockerfile are code of the project. Docker reads the context and pulls
    // the base images. The tag goes to the new image, and the earlier image stays.
    effects: { reads: ["docker", "fs", "network"], writes: ["docker", "process"], destructive: false },
    fsRoot: BUILD_UNDER_A_ROOT,
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
  .input(DockerPullInputSchema)
  .output(DockerCommandOutputSchema)
  .meta({
    description: "Pull a Docker image",
    calls: ["shell.run"],
    effects: { reads: ["docker", "network"], writes: ["docker"], destructive: false, idempotent: true },
    fsRoot: DOCKER_IN_A_ROOT,
    args: ["image"],
    output: "json",
  })
  .handler(async (input: DockerPullInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerPull(input, ctx);
  })
  .build();

const dockerExecProcedure = createProcedure()
  .path(["docker", "exec"])
  .input(DockerExecInputSchema)
  .output(DockerCommandOutputSchema)
  .meta({
    description: "Execute command in a running container",
    calls: ["shell.run"],
    // The container runs the command of the caller
    effects: { reads: ["docker"], writes: ["docker", "process"] },
    fsRoot: EXEC_UNDER_A_ROOT,
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
  .input(DockerStopInputSchema)
  .output(DockerCommandOutputSchema)
  .meta({
    description: "Stop running container(s)",
    calls: ["shell.run"],
    // The stop of a stopped container changes nothing
    effects: { reads: ["docker"], writes: ["docker"], idempotent: true },
    fsRoot: DOCKER_IN_A_ROOT,
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
  .input(DockerRmInputSchema)
  .output(DockerCommandOutputSchema)
  .meta({
    description: "Remove container(s)",
    calls: ["shell.run"],
    effects: { reads: ["docker"], writes: ["docker"] },
    fsRoot: DOCKER_IN_A_ROOT,
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
  .input(DockerPsInputSchema)
  .output(DockerCommandOutputSchema)
  .meta({
    description: "List containers",
    calls: ["shell.run"],
    effects: { reads: ["docker"], writes: [] },
    fsRoot: DOCKER_IN_A_ROOT,
    shorts: { all: "a", filter: "f", format: "F" },
    output: "json",
  })
  .handler(async (input: DockerPsInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerPs(input, ctx);
  })
  .build();

const dockerLogsProcedure = createProcedure()
  .path(["docker", "logs"])
  .input(DockerLogsInputSchema)
  // One value, or with follow one item for each log line (a stream)
  .output(DockerLogsOutputSchema)
  .meta({
    description: "Get container logs",
    calls: ["shell.run", "shell.stream"],
    effects: { reads: ["docker"], writes: [] },
    fsRoot: DOCKER_IN_A_ROOT,
    // With follow, the stream runs as long as the container (roadmap R15)
    stream: { unbounded: true },
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
  .input(DockerComposeUpInputSchema)
  .output(DockerCommandOutputSchema)
  .meta({
    description: "Start services with docker compose",
    calls: ["shell.run"],
    // The compose file of the caller sets the images, the commands and the host folders of the
    // services. An up can replace the containers of changed services.
    effects: { reads: ["docker", "fs", "network"], writes: ["docker", "fs", "process"] },
    fsRoot: COMPOSE_UNDER_A_ROOT,
    shorts: { file: "f", detach: "d", build: "b" },
    output: "json",
  })
  .handler(async (input: DockerComposeUpInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerComposeUp(input, ctx);
  })
  .build();

const dockerComposeDownProcedure = createProcedure()
  .path(["docker", "compose", "down"])
  .input(DockerComposeDownInputSchema)
  .output(DockerCommandOutputSchema)
  .meta({
    description: "Stop services with docker compose",
    calls: ["shell.run"],
    // It removes the containers of the project, and with volumes: true its volumes. A second down
    // changes nothing.
    effects: { reads: ["docker", "fs"], writes: ["docker"], idempotent: true },
    fsRoot: COMPOSE_UNDER_A_ROOT,
    shorts: { file: "f", volumes: "v" },
    output: "json",
  })
  .handler(async (input: DockerComposeDownInput, ctx: ProcedureContext): Promise<DockerCommandOutput> => {
    return dockerComposeDown(input, ctx);
  })
  .build();

// =============================================================================
// Roadmap R41: compose ps, logs, build, restart, images, inspect, volumes, networks, tag, push, prune
// =============================================================================

const dockerComposePsProcedure = createProcedure()
  .path(["docker", "compose", "ps"])
  .input(DockerComposePsInputSchema)
  .output(DockerComposePsOutputSchema)
  .meta({
    description: "List the containers of a compose project",
    calls: ["shell.run"],
    // Docker reads the compose file
    effects: { reads: ["docker", "fs"], writes: [] },
    fsRoot: COMPOSE_UNDER_A_ROOT,
    args: ["services"],
    shorts: { file: "f", all: "a", format: "F" },
    output: "json",
  })
  .handler(async (input: DockerComposePsInput, ctx: ProcedureContext): Promise<DockerComposePsOutput> => dockerComposePs(input, ctx))
  .build();

const dockerComposeLogsProcedure = createProcedure()
  .path(["docker", "compose", "logs"])
  .input(DockerComposeLogsInputSchema)
  .output(DockerComposeLogsOutputSchema)
  .meta({
    description: "Get the logs of the services of a compose project (without follow)",
    calls: ["shell.run"],
    effects: { reads: ["docker", "fs"], writes: [] },
    fsRoot: COMPOSE_UNDER_A_ROOT,
    args: ["services"],
    shorts: { file: "f", tail: "n", timestamps: "t" },
    output: "json",
  })
  .handler(async (input: DockerComposeLogsInput, ctx: ProcedureContext): Promise<DockerComposeLogsOutput> => dockerComposeLogs(input, ctx))
  .build();

const dockerComposeBuildProcedure = createProcedure()
  .path(["docker", "compose", "build"])
  .input(DockerComposeBuildInputSchema)
  .output(DockerComposeBuildOutputSchema)
  .meta({
    description: "Build the images of the services of a compose project",
    calls: ["shell.run"],
    // As docker.build: the RUN steps are code of the project, and docker pulls the base images.
    // The tags go to the new images, and the earlier images stay.
    effects: { reads: ["docker", "fs", "network"], writes: ["docker", "process"], destructive: false },
    fsRoot: COMPOSE_UNDER_A_ROOT,
    args: ["services"],
    shorts: { file: "f" },
    output: "json",
  })
  .handler(async (input: DockerComposeBuildInput, ctx: ProcedureContext): Promise<DockerComposeBuildOutput> => dockerComposeBuild(input, ctx))
  .build();

const dockerComposeRestartProcedure = createProcedure()
  .path(["docker", "compose", "restart"])
  .input(DockerComposeRestartInputSchema)
  .output(DockerComposeRestartOutputSchema)
  .meta({
    description: "Restart the services of a compose project",
    calls: ["shell.run"],
    // A restart stops the processes of the services. Each call restarts them again.
    effects: { reads: ["docker", "fs"], writes: ["docker"] },
    fsRoot: COMPOSE_UNDER_A_ROOT,
    args: ["services"],
    shorts: { file: "f", time: "t" },
    output: "json",
  })
  .handler(async (input: DockerComposeRestartInput, ctx: ProcedureContext): Promise<DockerComposeRestartOutput> => dockerComposeRestart(input, ctx))
  .build();

const dockerImagesProcedure = createProcedure()
  .path(["docker", "images"])
  .input(DockerImagesInputSchema)
  .output(DockerImagesOutputSchema)
  .meta({
    description: "List images",
    calls: ["shell.run"],
    effects: { reads: ["docker"], writes: [] },
    fsRoot: DOCKER_IN_A_ROOT,
    args: ["repository"],
    shorts: { all: "a", filter: "f", format: "F" },
    output: "json",
  })
  .handler(async (input: DockerImagesInput, ctx: ProcedureContext): Promise<DockerImagesOutput> => dockerImages(input, ctx))
  .build();

const dockerInspectProcedure = createProcedure()
  .path(["docker", "inspect"])
  .input(DockerInspectInputSchema)
  .output(DockerInspectOutputSchema)
  .meta({
    description: "Give the details of containers, images, volumes or networks: data has the JSON of docker",
    calls: ["shell.run"],
    effects: { reads: ["docker"], writes: [] },
    fsRoot: DOCKER_IN_A_ROOT,
    args: ["targets"],
    shorts: { type: "T", format: "F" },
    output: "json",
  })
  .handler(async (input: DockerInspectInput, ctx: ProcedureContext): Promise<DockerInspectOutput> => dockerInspect(input, ctx))
  .build();

const dockerVolumeListProcedure = createProcedure()
  .path(["docker", "volume", "list"])
  .input(DockerVolumeListInputSchema)
  .output(DockerVolumeListOutputSchema)
  .meta({
    description: "List volumes",
    calls: ["shell.run"],
    effects: { reads: ["docker"], writes: [] },
    fsRoot: DOCKER_IN_A_ROOT,
    shorts: { filter: "f", format: "F" },
    output: "json",
  })
  .handler(async (input: DockerVolumeListInput, ctx: ProcedureContext): Promise<DockerVolumeListOutput> => dockerVolumeList(input, ctx))
  .build();

const dockerVolumeCreateProcedure = createProcedure()
  .path(["docker", "volume", "create"])
  .input(DockerVolumeCreateInputSchema)
  .output(DockerVolumeCreateOutputSchema)
  .meta({
    description: "Create a volume. A volume that exists stays as it is",
    calls: ["shell.run"],
    effects: { reads: ["docker"], writes: ["docker"], destructive: false, idempotent: true },
    fsRoot: DOCKER_IN_A_ROOT,
    args: ["name"],
    shorts: { driver: "d" },
    output: "json",
  })
  .handler(async (input: DockerVolumeCreateInput, ctx: ProcedureContext): Promise<DockerVolumeCreateOutput> => dockerVolumeCreate(input, ctx))
  .build();

const dockerVolumeRemoveProcedure = createProcedure()
  .path(["docker", "volume", "remove"])
  .input(DockerVolumeRemoveInputSchema)
  .output(DockerVolumeRemoveOutputSchema)
  .meta({
    description: "Remove volumes. Their data is lost",
    calls: ["shell.run"],
    effects: { reads: ["docker"], writes: ["docker"], destructive: true, idempotent: true },
    fsRoot: DOCKER_IN_A_ROOT,
    args: ["volumes"],
    shorts: { force: "f" },
    output: "json",
  })
  .handler(async (input: DockerVolumeRemoveInput, ctx: ProcedureContext): Promise<DockerVolumeRemoveOutput> => dockerVolumeRemove(input, ctx))
  .build();

const dockerNetworkListProcedure = createProcedure()
  .path(["docker", "network", "list"])
  .input(DockerNetworkListInputSchema)
  .output(DockerNetworkListOutputSchema)
  .meta({
    description: "List networks",
    calls: ["shell.run"],
    effects: { reads: ["docker"], writes: [] },
    fsRoot: DOCKER_IN_A_ROOT,
    shorts: { filter: "f", format: "F" },
    output: "json",
  })
  .handler(async (input: DockerNetworkListInput, ctx: ProcedureContext): Promise<DockerNetworkListOutput> => dockerNetworkList(input, ctx))
  .build();

const dockerNetworkCreateProcedure = createProcedure()
  .path(["docker", "network", "create"])
  .input(DockerNetworkCreateInputSchema)
  .output(DockerNetworkCreateOutputSchema)
  .meta({
    description: "Create a network. A name that exists is an error",
    calls: ["shell.run"],
    effects: { reads: ["docker"], writes: ["docker"], destructive: false, idempotent: true },
    fsRoot: DOCKER_IN_A_ROOT,
    args: ["name"],
    shorts: { driver: "d" },
    output: "json",
  })
  .handler(async (input: DockerNetworkCreateInput, ctx: ProcedureContext): Promise<DockerNetworkCreateOutput> => dockerNetworkCreate(input, ctx))
  .build();

const dockerNetworkRemoveProcedure = createProcedure()
  .path(["docker", "network", "remove"])
  .input(DockerNetworkRemoveInputSchema)
  .output(DockerNetworkRemoveOutputSchema)
  .meta({
    description: "Remove networks",
    calls: ["shell.run"],
    effects: { reads: ["docker"], writes: ["docker"], destructive: true, idempotent: true },
    fsRoot: DOCKER_IN_A_ROOT,
    args: ["networks"],
    output: "json",
  })
  .handler(async (input: DockerNetworkRemoveInput, ctx: ProcedureContext): Promise<DockerNetworkRemoveOutput> => dockerNetworkRemove(input, ctx))
  .build();

const dockerTagProcedure = createProcedure()
  .path(["docker", "tag"])
  .input(DockerTagInputSchema)
  .output(DockerTagOutputSchema)
  .meta({
    description: "Give an image another name. An image that had the name loses it",
    calls: ["shell.run"],
    // The name moves from another image, so it is destructive
    effects: { reads: ["docker"], writes: ["docker"], idempotent: true },
    fsRoot: DOCKER_IN_A_ROOT,
    args: ["source", "target"],
    output: "json",
  })
  .handler(async (input: DockerTagInput, ctx: ProcedureContext): Promise<DockerTagOutput> => dockerTag(input, ctx))
  .build();

const dockerPushProcedure = createProcedure()
  .path(["docker", "push"])
  .input(DockerPushInputSchema)
  .output(DockerPushOutputSchema)
  .meta({
    description: "Push an image to a registry. The registry replaces an image with the same tag",
    calls: ["shell.run"],
    // A write to the registry: it replaces the image of the tag there
    effects: { reads: ["docker", "network"], writes: ["network"], idempotent: true },
    fsRoot: DOCKER_IN_A_ROOT,
    args: ["image"],
    shorts: { allTags: "a" },
    output: "json",
  })
  .handler(async (input: DockerPushInput, ctx: ProcedureContext): Promise<DockerPushOutput> => dockerPush(input, ctx))
  .build();

const dockerPruneProcedure = createProcedure()
  .path(["docker", "prune"])
  .input(DockerPruneInputSchema)
  .output(DockerPruneOutputSchema)
  .meta({
    description: "Remove unused containers, images, volumes, networks or build cache. It needs confirm: true",
    calls: ["shell.run"],
    // The removed objects and their data are lost. A second call finds less to remove.
    effects: { reads: ["docker"], writes: ["docker"], destructive: true, idempotent: true },
    fsRoot: DOCKER_IN_A_ROOT,
    shorts: { kind: "k", all: "a", filter: "f" },
    output: "json",
  })
  .handler(async (input: DockerPruneInput, ctx: ProcedureContext): Promise<DockerPruneOutput> => dockerPrune(input, ctx))
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
    dockerComposePsProcedure,
    dockerComposeLogsProcedure,
    dockerComposeBuildProcedure,
    dockerComposeRestartProcedure,
    dockerImagesProcedure,
    dockerInspectProcedure,
    dockerVolumeListProcedure,
    dockerVolumeCreateProcedure,
    dockerVolumeRemoveProcedure,
    dockerNetworkListProcedure,
    dockerNetworkCreateProcedure,
    dockerNetworkRemoveProcedure,
    dockerTagProcedure,
    dockerPushProcedure,
    dockerPruneProcedure,
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
