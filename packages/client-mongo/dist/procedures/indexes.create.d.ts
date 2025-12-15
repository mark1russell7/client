/**
 * Procedure: mongo.indexes.create
 * Create an index on a collection
 */
import { type Procedure } from "client";
import { type IndexSpec, type IndexOptions } from "../types.js";
interface CreateIndexInput {
    keys: IndexSpec;
    options?: IndexOptions;
}
interface CreateIndexOutput {
    acknowledged: boolean;
    indexName: string;
}
export declare const createIndexProcedure: Procedure<CreateIndexInput, CreateIndexOutput, {
    description: string;
}>;
export type { CreateIndexInput, CreateIndexOutput };
//# sourceMappingURL=indexes.create.d.ts.map