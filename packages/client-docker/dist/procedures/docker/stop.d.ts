/**
 * docker.stop procedure
 *
 * Stop running container(s).
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { DockerStopInput, DockerCommandOutput } from "../../types.js";
/**
 * Stop container(s)
 */
export declare function dockerStop(input: DockerStopInput, ctx: ProcedureContext): Promise<DockerCommandOutput>;
//# sourceMappingURL=stop.d.ts.map