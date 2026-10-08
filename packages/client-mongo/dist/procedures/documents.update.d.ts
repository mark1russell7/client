/**
 * Procedure: mongo.documents.update
 * Update documents matching a filter
 */
import { type Procedure } from "@mark1russell7/client";
import { type IdType, type DocumentQuery, type DocumentUpdate } from "../types.js";
interface UpdateInput {
    /** Filter to match documents (or id for single document) */
    filter?: DocumentQuery;
    /** Document ID (alternative to filter for single document) */
    id?: string;
    /** How to interpret the id (default: "auto" — matches ObjectId or string) */
    idType?: IdType;
    /** Update operations */
    update: DocumentUpdate;
    /** Insert if not found */
    upsert?: boolean;
    /** Update all matching documents */
    multi?: boolean;
}
interface UpdateOutput {
    acknowledged: boolean;
    matchedCount: number;
    modifiedCount: number;
    upsertedId: string | null;
    upsertedCount: number;
}
export declare const updateProcedure: Procedure<UpdateInput, UpdateOutput, {
    description: string;
}>;
export type { UpdateInput, UpdateOutput };
//# sourceMappingURL=documents.update.d.ts.map