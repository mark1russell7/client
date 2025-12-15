/**
 * Procedure: mongo.database.info
 * Get database information and statistics
 */
import { type Procedure } from "client";
import { type DatabaseInfo } from "../types.js";
interface InfoInput {
    [key: string]: never;
}
export declare const infoProcedure: Procedure<InfoInput, DatabaseInfo, {
    description: string;
}>;
export type { InfoInput };
export type InfoOutput = DatabaseInfo;
//# sourceMappingURL=database.info.d.ts.map