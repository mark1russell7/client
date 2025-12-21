/**
 * Procedure Registration for Docker operations
 *
 * Provides docker.run, docker.build, docker.pull, docker.exec, docker.stop,
 * docker.rm, docker.ps, docker.logs, docker.compose.up, docker.compose.down procedures.
 */
import { createProcedure, registerProcedures } from "@mark1russell7/client";
import { dockerRun, dockerBuild, dockerPull, dockerExec, dockerStop, dockerRm, dockerPs, dockerLogs, dockerComposeUp, dockerComposeDown, } from "./procedures/docker/index.js";
import { DockerRunInputSchema, DockerBuildInputSchema, DockerPullInputSchema, DockerExecInputSchema, DockerStopInputSchema, DockerRmInputSchema, DockerPsInputSchema, DockerLogsInputSchema, DockerComposeUpInputSchema, DockerComposeDownInputSchema, } from "./types.js";
function zodAdapter(schema) {
    return {
        parse: (data) => schema.parse(data),
        safeParse: (data) => {
            try {
                const parsed = schema.parse(data);
                return { success: true, data: parsed };
            }
            catch (error) {
                const err = error;
                return {
                    success: false,
                    error: {
                        message: err.message ?? "Validation failed",
                        errors: Array.isArray(err.errors)
                            ? err.errors.map((e) => {
                                const errObj = e;
                                return {
                                    path: (errObj.path ?? []),
                                    message: errObj.message ?? "Unknown error",
                                };
                            })
                            : [],
                    },
                };
            }
        },
        _output: undefined,
    };
}
function outputSchema() {
    return {
        parse: (data) => data,
        safeParse: (data) => ({ success: true, data: data }),
        _output: undefined,
    };
}
// =============================================================================
// Procedures
// =============================================================================
const dockerRunProcedure = createProcedure()
    .path(["docker", "run"])
    .input(zodAdapter(DockerRunInputSchema))
    .output(outputSchema())
    .meta({
    description: "Run a Docker container",
    args: ["image"],
    shorts: { name: "n", detach: "d" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return dockerRun(input, ctx);
})
    .build();
const dockerBuildProcedure = createProcedure()
    .path(["docker", "build"])
    .input(zodAdapter(DockerBuildInputSchema))
    .output(outputSchema())
    .meta({
    description: "Build a Docker image",
    args: ["context"],
    shorts: { tag: "t", dockerfile: "f" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return dockerBuild(input, ctx);
})
    .build();
const dockerPullProcedure = createProcedure()
    .path(["docker", "pull"])
    .input(zodAdapter(DockerPullInputSchema))
    .output(outputSchema())
    .meta({
    description: "Pull a Docker image",
    args: ["image"],
    output: "json",
})
    .handler(async (input, ctx) => {
    return dockerPull(input, ctx);
})
    .build();
const dockerExecProcedure = createProcedure()
    .path(["docker", "exec"])
    .input(zodAdapter(DockerExecInputSchema))
    .output(outputSchema())
    .meta({
    description: "Execute command in a running container",
    args: ["container", "command"],
    shorts: { interactive: "i", tty: "t", workdir: "w" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return dockerExec(input, ctx);
})
    .build();
const dockerStopProcedure = createProcedure()
    .path(["docker", "stop"])
    .input(zodAdapter(DockerStopInputSchema))
    .output(outputSchema())
    .meta({
    description: "Stop running container(s)",
    args: ["containers"],
    shorts: { time: "t" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return dockerStop(input, ctx);
})
    .build();
const dockerRmProcedure = createProcedure()
    .path(["docker", "rm"])
    .input(zodAdapter(DockerRmInputSchema))
    .output(outputSchema())
    .meta({
    description: "Remove container(s)",
    args: ["containers"],
    shorts: { force: "f", volumes: "v" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return dockerRm(input, ctx);
})
    .build();
const dockerPsProcedure = createProcedure()
    .path(["docker", "ps"])
    .input(zodAdapter(DockerPsInputSchema))
    .output(outputSchema())
    .meta({
    description: "List containers",
    shorts: { all: "a", filter: "f", format: "F" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return dockerPs(input, ctx);
})
    .build();
const dockerLogsProcedure = createProcedure()
    .path(["docker", "logs"])
    .input(zodAdapter(DockerLogsInputSchema))
    .output(outputSchema())
    .meta({
    description: "Get container logs",
    args: ["container"],
    shorts: { follow: "f", tail: "n", timestamps: "t" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return dockerLogs(input, ctx);
})
    .build();
const dockerComposeUpProcedure = createProcedure()
    .path(["docker", "compose", "up"])
    .input(zodAdapter(DockerComposeUpInputSchema))
    .output(outputSchema())
    .meta({
    description: "Start services with docker compose",
    shorts: { file: "f", detach: "d", build: "b" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return dockerComposeUp(input, ctx);
})
    .build();
const dockerComposeDownProcedure = createProcedure()
    .path(["docker", "compose", "down"])
    .input(zodAdapter(DockerComposeDownInputSchema))
    .output(outputSchema())
    .meta({
    description: "Stop services with docker compose",
    shorts: { file: "f", volumes: "v" },
    output: "json",
})
    .handler(async (input, ctx) => {
    return dockerComposeDown(input, ctx);
})
    .build();
// =============================================================================
// Registration
// =============================================================================
export function registerDockerProcedures() {
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
//# sourceMappingURL=register.js.map