/**
 * docker.pull procedure
 *
 * Pull a Docker image.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { DockerPullInput, DockerCommandOutput } from "../../types.js";
/**
 * Pull a Docker image
 */
export declare function dockerPull(input: DockerPullInput, ctx: ProcedureContext): Promise<DockerCommandOutput>;
//# sourceMappingURL=pull.d.ts.map