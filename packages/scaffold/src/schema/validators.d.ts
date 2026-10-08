/**
 * Schema Validators
 *
 * TypeScript type-level utilities that enforce compile-time completeness
 * of generator registries. Adding a file to REPO_SCHEMA without a
 * corresponding generator causes a TypeScript error.
 */
import { METADATA_KEY } from "./metadata.js";
import { FSType } from "./types.js";
import type { SchemaNode, NodeMetadata, GeneratorFn } from "./types.js";
/**
 * Helper type to check if a metadata object is for a file
 */
type IsFileMetadata<M> = M extends {
    type: FSType.File;
} ? true : false;
/**
 * Extract the metadata from a schema node
 */
type GetMetadata<T> = T extends {
    [METADATA_KEY]: infer M;
} ? M : never;
/**
 * Get all keys of a schema node except METADATA_KEY
 */
type ChildKeys<T> = Exclude<keyof T, typeof METADATA_KEY>;
/**
 * Recursively extract all file paths from a schema.
 *
 * This type walks the nested schema and builds a union of all
 * file paths (e.g., "package.json" | "src/index.ts" | ...).
 */
type ExtractFilePaths<T extends SchemaNode, CurrentPath extends string = ""> = T extends SchemaNode ? {
    [K in ChildKeys<T>]: T[K] extends SchemaNode ? K extends string ? CurrentPath extends "" ? IsFileMetadata<GetMetadata<T[K]>> extends true ? K : ExtractFilePaths<T[K], K> : IsFileMetadata<GetMetadata<T[K]>> extends true ? `${CurrentPath}/${K}` : ExtractFilePaths<T[K], `${CurrentPath}/${K}`> : never : never;
}[ChildKeys<T>] : never;
/**
 * The generator registry type.
 *
 * This enforces that every file path in the schema has a generator.
 * Missing entries cause TypeScript errors.
 */
export type GeneratorRegistry<TSchema extends SchemaNode> = {
    [P in ExtractFilePaths<TSchema>]: GeneratorFn;
};
/**
 * Create a type-safe generator registry.
 *
 * This function ensures at compile time that every file in the schema
 * has a corresponding generator. Missing generators cause TypeScript errors.
 *
 * @example
 * ```typescript
 * // TypeScript ERRORS if any file path is missing
 * export const generators = createGeneratorRegistry(REPO_SCHEMA, {
 *   "package.json": cueGenerator("npm/package:output"),
 *   "tsconfig.json": cueGenerator("ts/config:output"),
 *   ".gitignore": cueGenerator("git/ignore:output"),
 *   "dependencies.json": templateGenerator("dependencies.json.ejs"),
 *   "vitest.config.ts": generateVitestConfig,
 *   "src/index.ts": generateIndexTs,
 *   // Missing entry = compile error!
 * });
 * ```
 */
export declare function createGeneratorRegistry<TSchema extends SchemaNode>(_schema: TSchema, generators: GeneratorRegistry<TSchema>): GeneratorRegistry<TSchema>;
/**
 * Walk the schema tree and call a visitor for each node.
 */
export declare function walkSchema(node: SchemaNode, currentPath: string, visitor: (path: string, metadata: NodeMetadata, node: SchemaNode) => void): void;
/**
 * Get all file paths from the schema.
 */
export declare function getFilePaths(schema: SchemaNode): string[];
/**
 * Get all directory paths from the schema.
 */
export declare function getDirectoryPaths(schema: SchemaNode): string[];
/**
 * Validate that a generator registry covers all files in the schema.
 * This is a runtime check that complements the compile-time type checking.
 */
export declare function validateRegistry(schema: SchemaNode, registry: Record<string, GeneratorFn>): {
    valid: boolean;
    missing: string[];
    extra: string[];
};
export {};
//# sourceMappingURL=validators.d.ts.map