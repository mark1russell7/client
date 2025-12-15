/**
 * Procedure: mongo.documents.count
 * Count documents matching a filter
 */
import { type Procedure } from "client";
import { type DocumentQuery } from "../types.js";
interface CountInput {
    query?: DocumentQuery;
}
interface CountOutput {
    count: number;
}
export declare const countProcedure: Procedure<CountInput, CountOutput, {
    description: string;
}>;
export type { CountInput, CountOutput };
//# sourceMappingURL=documents.count.d.ts.map