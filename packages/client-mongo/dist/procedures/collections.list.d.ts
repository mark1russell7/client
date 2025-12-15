/**
 * Procedure: mongo.collections.list
 * List all collections in the database
 */
import { type Procedure } from "client";
interface ListInput {
    [key: string]: never;
}
interface ListOutput {
    collections: string[];
}
export declare const listProcedure: Procedure<ListInput, ListOutput, {
    description: string;
}>;
export type { ListInput, ListOutput };
//# sourceMappingURL=collections.list.d.ts.map