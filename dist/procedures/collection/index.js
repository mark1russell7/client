/**
 * Collection Procedures
 *
 * Procedure definitions for collection CRUD operations.
 */
// Schemas
export { idSchema, collectionNameSchema, valueSchema, getInputSchema, getOutputSchema, setInputSchema, setOutputSchema, deleteInputSchema, deleteOutputSchema, hasInputSchema, hasOutputSchema, getAllInputSchema, getAllOutputSchema, sizeInputSchema, sizeOutputSchema, clearInputSchema, clearOutputSchema, getBatchInputSchema, getBatchOutputSchema, setBatchInputSchema, setBatchOutputSchema, deleteBatchInputSchema, deleteBatchOutputSchema, } from "./schemas";
// Procedures
export { createCollectionProcedures, genericGetProcedure, genericSetProcedure, genericDeleteProcedure, genericCollectionProcedures, collectionModule, } from "./procedures";
//# sourceMappingURL=index.js.map