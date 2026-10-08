/**
 * @mark1russell7/scaffold
 *
 * Schema-driven scaffolding system with Angular Schematics and ts-morph.
 */

// Schema exports
export {
  METADATA_KEY,
  FSType,
  Generator,
  Feature,
  REPO_SCHEMA,
  createGeneratorRegistry,
  walkSchema,
  getFilePaths,
  getDirectoryPaths,
  validateRegistry,
} from "./schema/index.js";

export type {
  MetadataKeyType,
  FileMetadata,
  DirectoryMetadata,
  NodeMetadata,
  SchemaNode,
  GeneratorContext,
  GeneratorFn,
  RepoSchema,
  GeneratorRegistry,
} from "./schema/index.js";

// Generator exports
export {
  cueGenerator,
  runCueConfigInit,
  runCueConfigGenerate,
  generateVitestConfig,
  generateIndexTs,
  generateTestFile,
  generateRegisterTs,
  templateGenerator,
  registerTemplate,
  generators,
  getGenerator,
} from "./generators/index.js";

// Feature exports
export {
  setFeatureConfig,
  getFeatureConfig,
  resolveFeatures,
  isFeatureActive,
  getPresets,
  getPresetFeatures,
} from "./features/index.js";
