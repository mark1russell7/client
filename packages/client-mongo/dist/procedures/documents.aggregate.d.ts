/**
 * Procedure: mongo.documents.aggregate
 * Run an aggregation pipeline
 */
import { type Procedure } from "@mark1russell7/client";
import { type AggregationStage, type AggregationOptions, type MongoDocument } from "../types.js";
interface AggregateInput {
    pipeline: AggregationStage[];
    options?: AggregationOptions;
}
interface AggregateOutput {
    results: MongoDocument[];
}
export declare const aggregateProcedure: Procedure<AggregateInput, AggregateOutput, {
    description: string;
}>;
export type { AggregateInput, AggregateOutput };
//# sourceMappingURL=documents.aggregate.d.ts.map