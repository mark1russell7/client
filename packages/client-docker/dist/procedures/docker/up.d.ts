/**
 * docker.compose.up procedure
 *
 * Start services with docker compose.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { DockerComposeUpInput, DockerCommandOutput } from "../../types.js";
/**
 * Start services with docker compose
 */
export declare function dockerComposeUp(input: DockerComposeUpInput, ctx: ProcedureContext): Promise<DockerCommandOutput>;
//# sourceMappingURL=up.d.ts.map