/**
 * Procedure: mongo.collections.create
 * Create a new collection
 */
import { type Procedure } from "client";
import { type CollectionOptions } from "../types.js";
interface CreateInput {
    name: string;
    options?: CollectionOptions;
}
interface CreateOutput {
    acknowledged: boolean;
    collectionName: string;
}
export declare const createCollectionProcedure: Procedure<CreateInput, CreateOutput, {
    description: string;
}>;
export type { CreateInput, CreateOutput };
//# sourceMappingURL=collections.create.d.ts.map