/**
 * docker.rm procedure
 *
 * Remove container(s).
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { DockerRmInput, DockerCommandOutput } from "../../types.js";
/**
 * Remove container(s)
 */
export declare function dockerRm(input: DockerRmInput, ctx: ProcedureContext): Promise<DockerCommandOutput>;
//# sourceMappingURL=rm.d.ts.map