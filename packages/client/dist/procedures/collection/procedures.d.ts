/**
 * Collection Procedures
 *
 * Procedure definitions for collection CRUD operations.
 * These procedures delegate to storage backends via the repository pattern.
 */
import type { AnyProcedure } from "../types";
import { type GetInput, type SetInput, type DeleteInput } from "./schemas";
/**
 * Create collection procedures for a specific collection name.
 *
 * @param collectionName - Name of the collection
 * @returns Array of procedure definitions
 *
 * @example
 * ```typescript
 * const userProcedures = createCollectionProcedures('users');
 * registry.registerAll(userProcedures);
 * ```
 */
export declare function createCollectionProcedures(collectionName: string): AnyProcedure[];
/**
 * Generic get procedure that works with any collection.
 * Uses the collection name from the path.
 */
export declare const genericGetProcedure: import("..").Procedure<GetInput, unknown, {
    description: string;
    tags: string[];
}>;
/**
 * Generic set procedure that works with any collection.
 */
export declare const genericSetProcedure: import("..").Procedure<SetInput, void, {
    description: string;
    tags: string[];
}>;
/**
 * Generic delete procedure that works with any collection.
 */
export declare const genericDeleteProcedure: import("..").Procedure<DeleteInput, boolean, {
    description: string;
    tags: string[];
}>;
/**
 * All generic collection procedures.
 * Register these for dynamic collection support.
 */
export declare const genericCollectionProcedures: AnyProcedure[];
/**
 * Module export for procedure registration.
 */
export declare const collectionModule: {
    name: string;
    procedures: AnyProcedure[];
};
//# sourceMappingURL=procedures.d.ts.map