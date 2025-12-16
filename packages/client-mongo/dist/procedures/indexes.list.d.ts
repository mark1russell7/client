/**
 * Procedure: mongo.indexes.list
 * List indexes on a collection
 */
import { type Procedure } from "@mark1russell7/client";
import { type IndexInfo } from "../types.js";
interface ListIndexesInput {
    [key: string]: never;
}
interface ListIndexesOutput {
    indexes: IndexInfo[];
}
export declare const listIndexesProcedure: Procedure<ListIndexesInput, ListIndexesOutput, {
    description: string;
}>;
export type { ListIndexesInput, ListIndexesOutput };
//# sourceMappingURL=indexes.list.d.ts.map