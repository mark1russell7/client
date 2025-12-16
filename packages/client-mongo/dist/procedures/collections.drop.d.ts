/**
 * Procedure: mongo.collections.drop
 * Drop (delete) a collection
 */
import { type Procedure } from "@mark1russell7/client";
interface DropInput {
    /** Confirmation required to prevent accidental drops */
    confirm: boolean;
}
interface DropOutput {
    acknowledged: boolean;
    dropped: boolean;
}
export declare const dropProcedure: Procedure<DropInput, DropOutput, {
    description: string;
}>;
export type { DropInput, DropOutput };
//# sourceMappingURL=collections.drop.d.ts.map