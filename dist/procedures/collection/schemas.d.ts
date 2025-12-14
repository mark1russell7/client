/**
 * Collection Operation Schemas
 *
 * Zod-compatible schemas for collection CRUD operations.
 * These schemas are used for input/output validation in collection procedures.
 */
import type { ZodLike } from "../../client/validation/types";
/**
 * Schema for item ID.
 */
export declare const idSchema: ZodLike<string>;
/**
 * Schema for collection name.
 */
export declare const collectionNameSchema: ZodLike<string>;
/**
 * Schema for generic value (any JSON-serializable value).
 */
export declare const valueSchema: ZodLike<unknown>;
/**
 * Input for get operation.
 */
export interface GetInput {
    id: string;
}
export declare const getInputSchema: ZodLike<GetInput>;
/**
 * Output for get operation - the item or undefined.
 */
export declare const getOutputSchema: ZodLike<unknown>;
/**
 * Input for set operation.
 */
export interface SetInput {
    id: string;
    value: unknown;
}
export declare const setInputSchema: ZodLike<SetInput>;
/**
 * Output for set operation - void.
 */
export declare const setOutputSchema: ZodLike<void>;
/**
 * Input for delete operation.
 */
export interface DeleteInput {
    id: string;
}
export declare const deleteInputSchema: ZodLike<DeleteInput>;
/**
 * Output for delete operation - boolean indicating if deleted.
 */
export declare const deleteOutputSchema: ZodLike<boolean>;
/**
 * Input for has operation.
 */
export interface HasInput {
    id: string;
}
export declare const hasInputSchema: ZodLike<HasInput>;
/**
 * Output for has operation - boolean.
 */
export declare const hasOutputSchema: ZodLike<boolean>;
/**
 * Input for getAll operation - empty object.
 */
export interface GetAllInput {
}
export declare const getAllInputSchema: ZodLike<GetAllInput>;
/**
 * Output for getAll operation - array of items.
 */
export declare const getAllOutputSchema: ZodLike<unknown[]>;
/**
 * Input for size operation - empty object.
 */
export interface SizeInput {
}
export declare const sizeInputSchema: ZodLike<SizeInput>;
/**
 * Output for size operation - number.
 */
export declare const sizeOutputSchema: ZodLike<number>;
/**
 * Input for clear operation - empty object.
 */
export interface ClearInput {
}
export declare const clearInputSchema: ZodLike<ClearInput>;
/**
 * Output for clear operation - void.
 */
export declare const clearOutputSchema: ZodLike<void>;
/**
 * Input for getBatch operation.
 */
export interface GetBatchInput {
    ids: string[];
}
export declare const getBatchInputSchema: ZodLike<GetBatchInput>;
/**
 * Output for getBatch operation - object mapping ids to values.
 */
export declare const getBatchOutputSchema: ZodLike<Record<string, unknown>>;
/**
 * Input for setBatch operation.
 */
export interface SetBatchInput {
    items: Array<{
        id: string;
        value: unknown;
    }>;
}
export declare const setBatchInputSchema: ZodLike<SetBatchInput>;
/**
 * Output for setBatch operation - void.
 */
export declare const setBatchOutputSchema: ZodLike<void>;
/**
 * Input for deleteBatch operation.
 */
export interface DeleteBatchInput {
    ids: string[];
}
export declare const deleteBatchInputSchema: ZodLike<DeleteBatchInput>;
/**
 * Output for deleteBatch operation - number of deleted items.
 */
export declare const deleteBatchOutputSchema: ZodLike<number>;
//# sourceMappingURL=schemas.d.ts.map