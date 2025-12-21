/**
 * docker.run procedure
 *
 * Run a Docker container.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { DockerRunInput, DockerCommandOutput } from "../../types.js";
/**
 * Run a Docker container
 *
 * @example
 * // Run nginx in detached mode
 * await client.call(["docker", "run"], {
 *   image: "nginx:latest",
 *   name: "my-nginx",
 *   ports: ["8080:80"],
 *   detach: true,
 * });
 */
export declare function dockerRun(input: DockerRunInput, ctx: ProcedureContext): Promise<DockerCommandOutput>;
//# sourceMappingURL=run.d.ts.map