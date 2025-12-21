/**
 * docker.compose.down procedure
 *
 * Stop services with docker compose.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { DockerComposeDownInput, DockerCommandOutput } from "../../types.js";
/**
 * Stop services with docker compose
 */
export declare function dockerComposeDown(input: DockerComposeDownInput, ctx: ProcedureContext): Promise<DockerCommandOutput>;
//# sourceMappingURL=down.d.ts.map