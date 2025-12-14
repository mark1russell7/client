/**
 * Collection Procedures
 *
 * Procedure definitions for collection CRUD operations.
 */
export { idSchema, collectionNameSchema, valueSchema, getInputSchema, getOutputSchema, setInputSchema, setOutputSchema, deleteInputSchema, deleteOutputSchema, hasInputSchema, hasOutputSchema, getAllInputSchema, getAllOutputSchema, sizeInputSchema, sizeOutputSchema, clearInputSchema, clearOutputSchema, getBatchInputSchema, getBatchOutputSchema, setBatchInputSchema, setBatchOutputSchema, deleteBatchInputSchema, deleteBatchOutputSchema, } from "./schemas";
export type { GetInput, SetInput, DeleteInput, HasInput, GetAllInput, SizeInput, ClearInput, GetBatchInput, SetBatchInput, DeleteBatchInput, } from "./schemas";
export { createCollectionProcedures, genericGetProcedure, genericSetProcedure, genericDeleteProcedure, genericCollectionProcedures, collectionModule, } from "./procedures";
//# sourceMappingURL=index.d.ts.map