/**
 * Procedure: mongo.indexes.drop
 * Drop an index from a collection
 */
import { type Procedure } from "client";
interface DropIndexInput {
    indexName: string;
}
interface DropIndexOutput {
    acknowledged: boolean;
}
export declare const dropIndexProcedure: Procedure<DropIndexInput, DropIndexOutput, {
    description: string;
}>;
export type { DropIndexInput, DropIndexOutput };
//# sourceMappingURL=indexes.drop.d.ts.map