/**
 * docker.logs procedure
 *
 * Get container logs.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { DockerLogsInput, DockerCommandOutput } from "../../types.js";
/**
 * Get container logs
 */
export declare function dockerLogs(input: DockerLogsInput, ctx: ProcedureContext): Promise<DockerCommandOutput>;
//# sourceMappingURL=logs.d.ts.map