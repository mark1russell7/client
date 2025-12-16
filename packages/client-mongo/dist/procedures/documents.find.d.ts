/**
 * Procedure: mongo.documents.find
 * Find documents with pagination and filtering
 */
import { type Procedure } from "@mark1russell7/client";
import { type PaginationOutput, type DocumentQuery, type SortSpec, type MongoDocument } from "../types.js";
interface FindInput {
    query?: DocumentQuery;
    projection?: Record<string, 0 | 1>;
    sort?: SortSpec;
    page?: number;
    limit?: number;
}
interface FindOutput {
    documents: MongoDocument[];
    pagination: PaginationOutput;
}
export declare const findProcedure: Procedure<FindInput, FindOutput, {
    description: string;
}>;
export type { FindInput, FindOutput };
//# sourceMappingURL=documents.find.d.ts.map