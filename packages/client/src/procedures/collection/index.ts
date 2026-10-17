/**
 * Collection Procedures
 *
 * Procedure definitions for collection CRUD operations.
 */

// Schemas
export {
  idSchema,
  collectionNameSchema,
  valueSchema,
  getInputSchema,
  getOutputSchema,
  setInputSchema,
  setOutputSchema,
  deleteInputSchema,
  deleteOutputSchema,
  hasInputSchema,
  hasOutputSchema,
  getAllInputSchema,
  getAllOutputSchema,
  entriesInputSchema,
  entriesOutputSchema,
  changesInputSchema,
  changesOutputSchema,
  sizeInputSchema,
  sizeOutputSchema,
  clearInputSchema,
  clearOutputSchema,
  getBatchInputSchema,
  getBatchOutputSchema,
  setBatchInputSchema,
  setBatchOutputSchema,
  deleteBatchInputSchema,
  deleteBatchOutputSchema,
} from "./schemas.js";

export type {
  GetInput,
  GetFoundOutput,
  SetInput,
  DeleteInput,
  HasInput,
  GetAllInput,
  EntriesInput,
  CollectionEntry,
  ChangesInput,
  ChangesOutput,
  SizeInput,
  ClearInput,
  GetBatchInput,
  SetBatchInput,
  DeleteBatchInput,
} from "./schemas.js";

// Procedures
export { createCollectionProcedures } from "./procedures.js";

// The storage interface of the core (the shape of client-collections' CollectionStorage)
export type { CollectionStorage, StorageChanges, StorageMetadata } from "./storage.js";
