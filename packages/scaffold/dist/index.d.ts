/**
 * @mark1russell7/scaffold
 *
 * Schema-driven scaffolding system with Angular Schematics and ts-morph.
 */
export { METADATA_KEY, FSType, Generator, Feature, REPO_SCHEMA, createGeneratorRegistry, walkSchema, getFilePaths, getDirectoryPaths, validateRegistry, } from "./schema/index.js";
export type { MetadataKeyType, FileMetadata, DirectoryMetadata, NodeMetadata, SchemaNode, GeneratorContext, GeneratorFn, RepoSchema, GeneratorRegistry, } from "./schema/index.js";
export { cueGenerator, runCueConfigInit, runCueConfigGenerate, generateVitestConfig, generateIndexTs, generateTestFile, generateRegisterTs, templateGenerator, registerTemplate, generators, getGenerator, } from "./generators/index.js";
export { setFeatureConfig, getFeatureConfig, resolveFeatures, isFeatureActive, getPresets, getPresetFeatures, } from "./features/index.js";
//# sourceMappingURL=index.d.ts.map