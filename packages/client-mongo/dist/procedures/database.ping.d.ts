/**
 * Procedure: mongo.database.ping
 * Health check and connectivity test
 */
import { type Procedure } from "@mark1russell7/client";
interface PingInput {
    [key: string]: never;
}
interface PingOutput {
    ok: boolean;
    latencyMs: number;
}
export declare const pingProcedure: Procedure<PingInput, PingOutput, {
    description: string;
}>;
export type { PingInput, PingOutput };
//# sourceMappingURL=database.ping.d.ts.map