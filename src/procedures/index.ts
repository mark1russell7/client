/**
 * Procedure System
 *
 * Type-safe procedure definitions with schema validation,
 * registry for auto-discovery, and server integration.
 */

// Types
export type {
  ProcedurePath,
  ProcedureMetadata,
  RepositoryProvider,
  ProcedureContext,
  ProcedureHandler,
  Procedure,
  AnyProcedure,
  ProcedureResult,
  ProcedureError,
  InferProcedureInput,
  InferProcedureOutput,
  InferProcedureMetadata,
  RegistryEventType,
  RegistryListener,
  ProcedureModule,
  RegistrationOptions,
} from "./types";

// Type utilities
export { pathToKey, keyToPath } from "./types";

// Registry
export { ProcedureRegistry, RegistryError, PROCEDURE_REGISTRY } from "./registry";

// Definition helpers
export {
  defineProcedure,
  defineStub,
  createProcedure,
  ProcedureBuilder,
  namespace,
  validateProcedure,
} from "./define";
export type { ProcedureDefinition, ProcedureStub } from "./define";

// Collection procedures
export {
  createCollectionProcedures,
  genericCollectionProcedures,
  collectionModule,
} from "./collection";

// Manual registration helpers
export {
  registerModule,
  registerProcedures,
  createAndRegister,
} from "./discovery.js";
