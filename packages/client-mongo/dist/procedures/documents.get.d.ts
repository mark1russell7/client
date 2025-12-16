/**
 * Procedure: mongo.documents.get
 * Get a single document by ID
 */
import { type Procedure } from "@mark1russell7/client";
import { type MongoDocument } from "../types.js";
interface GetInput {
    id: string;
}
interface GetOutput {
    document: MongoDocument | null;
}
export declare const getProcedure: Procedure<GetInput, GetOutput, {
    description: string;
}>;
export type { GetInput, GetOutput };
//# sourceMappingURL=documents.get.d.ts.map