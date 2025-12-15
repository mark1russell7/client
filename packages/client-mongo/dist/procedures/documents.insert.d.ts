/**
 * Procedure: mongo.documents.insert
 * Insert one or more documents
 */
import { type Procedure } from "client";
import { type MongoDocument } from "../types.js";
interface InsertInput {
    /** Single document or array of documents */
    documents: MongoDocument | MongoDocument[];
}
interface InsertOutput {
    acknowledged: boolean;
    insertedIds: string[];
    insertedCount: number;
}
export declare const insertProcedure: Procedure<InsertInput, InsertOutput, {
    description: string;
}>;
export type { InsertInput, InsertOutput };
//# sourceMappingURL=documents.insert.d.ts.map