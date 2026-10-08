/**
 * docker.ps procedure
 *
 * List containers.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { DockerPsInput, DockerCommandOutput } from "../../types.js";
/**
 * List containers
 */
export declare function dockerPs(input: DockerPsInput, ctx: ProcedureContext): Promise<DockerCommandOutput>;
//# sourceMappingURL=ps.d.ts.map