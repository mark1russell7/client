/**
 * Procedure: mongo.documents.delete
 * Delete documents matching a filter
 */
import { type Procedure } from "@mark1russell7/client";
import { type DocumentQuery } from "../types.js";
interface DeleteInput {
    /** Filter to match documents (or id for single document) */
    filter?: DocumentQuery;
    /** Document ID (alternative to filter for single document) */
    id?: string;
    /** Delete all matching documents */
    multi?: boolean;
}
interface DeleteOutput {
    acknowledged: boolean;
    deletedCount: number;
}
export declare const deleteProcedure: Procedure<DeleteInput, DeleteOutput, {
    description: string;
}>;
export type { DeleteInput, DeleteOutput };
//# sourceMappingURL=documents.delete.d.ts.map