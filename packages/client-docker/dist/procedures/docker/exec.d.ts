/**
 * docker.exec procedure
 *
 * Execute command in a running container.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { DockerExecInput, DockerCommandOutput } from "../../types.js";
/**
 * Execute command in container
 */
export declare function dockerExec(input: DockerExecInput, ctx: ProcedureContext): Promise<DockerCommandOutput>;
//# sourceMappingURL=exec.d.ts.map