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
  findInputSchema,
  findOutputSchema,
  patchInputSchema,
  patchOutputSchema,
  idsInputSchema,
  idsOutputSchema,
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
  FindInput,
  PatchInput,
  IdsInput,
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
export type { CollectionProceduresOptions, CollectionChangeEventsOptions } from "./procedures.js";

// The change events of the writes (roadmap CLI-15)
export { collectionChangeTopic, collectionTopicReads } from "./changes.js";
export type { CollectionChangeEvent } from "./changes.js";

// The partitions of a collection (roadmap CLI-17)
export { PARTITION_PATTERN, collectionTopicPartition, collectionTopicTarget, partitionOfCall, storageOfCall, withPartition } from "./partition.js";
// The refusal of a storage whose topic is the topic of a partition (roadmap CLI-57). Deprecated since CLI-75
export { CollectionTopicCollisionError } from "./partition.js";
// The topic rule of a collection for EventPublisher (roadmap CLI-42)
export { collectionTopicRule } from "./topic.js";
export type { CollectionPartitions, PartitionInput, PartitionResolver } from "./partition.js";

// The rules of the rows of a collection: a filter of the reads and a guard of the writes (roadmap CLI-41)
export { admittedStorage, admitsRow } from "./admission.js";
export type { CollectionAdmission, CollectionRow, CollectionWrite, CollectionWriteGuard } from "./admission.js";

// The storage interface of the core (the shape of client-collections' CollectionStorage)
export type {
  CollectionStorage,
  StorageChanges,
  StorageMetadata,
  StorageWriteOptions,
  StorageItemWriteOptions,
  StorageBatchWriteOptions,
  StorageSetChange,
  StorageDeleteChange,
  StorageClearChange,
  StorageChangeEvent,
  StorageChangeBatch,
  StorageObserver,
} from "./storage.js";

// The precondition of the writes: the expected version and VERSION_CONFLICT (roadmap CLI-16)
export {
  MAX_EXPECTED_VERSION_LENGTH,
  PRECONDITION_NOT_SUPPORTED,
  VERSION_CONFLICTS_METADATA_KEY,
  VersionConflictError,
  asVersionConflictError,
  isExpectedVersion,
  preconditionNotSupported,
  versionConflict,
  versionConflicts,
  versionConflictsOf,
} from "./precondition.js";
export type { CurrentItem, VersionConflict, VersionOf } from "./precondition.js";

// The query language of the storages: the same JSON on the wire and in query() (roadmap CLI-34:
// the one copy of the language)
export {
  DEFAULT_FIND_LIMIT,
  DEFAULT_QUERY_OPERATORS,
  DEFAULT_QUERY_POLICY,
  QUERY_OPERATORS,
  applyPatch,
  compareStorageValues,
  compileSelector,
  isPatchOperations,
  matchesSelector,
  mergePatch,
  patchProblems,
  queryEntries,
  queryOptionsProblems,
  selectorProblems,
} from "./query.js";
export type {
  StorageFieldOperators,
  StoragePatch,
  StoragePatchOperations,
  StorageQueryOperator,
  StorageQueryOptions,
  StorageQueryPolicy,
  StorageSelector,
  StorageSort,
  StorageSortDirection,
} from "./query.js";
