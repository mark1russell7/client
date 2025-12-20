/**
 * Schema module exports
 */

export { METADATA_KEY } from "./metadata.js";
export type { MetadataKeyType } from "./metadata.js";
export { FSType, Generator, Feature } from "./types.js";
export type {
  FileMetadata,
  DirectoryMetadata,
  NodeMetadata,
  SchemaNode,
  GeneratorContext,
  GeneratorFn,
} from "./types.js";
export { REPO_SCHEMA } from "./repo-schema.js";
export type { RepoSchema } from "./repo-schema.js";
export {
  createGeneratorRegistry,
  walkSchema,
  getFilePaths,
  getDirectoryPaths,
  validateRegistry,
} from "./validators.js";
export type { GeneratorRegistry } from "./validators.js";
