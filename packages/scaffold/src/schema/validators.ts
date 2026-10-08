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
type IsFileMetadata<M> = M extends { type: FSType.File } ? true : false;

/**
 * Extract the metadata from a schema node
 */
type GetMetadata<T> = T extends { [METADATA_KEY]: infer M } ? M : never;

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
type ExtractFilePaths<
  T extends SchemaNode,
  CurrentPath extends string = ""
> = T extends SchemaNode
  ? {
      [K in ChildKeys<T>]: T[K] extends SchemaNode
        ? // Build the path for this node
          K extends string
          ? // Get the full path for this node
            CurrentPath extends ""
            ? // At root level
              IsFileMetadata<GetMetadata<T[K]>> extends true
              ? K // This is a file, return its name
              : ExtractFilePaths<T[K], K> // This is a directory, recurse
            : // Nested level
              IsFileMetadata<GetMetadata<T[K]>> extends true
              ? `${CurrentPath}/${K}` // This is a file, return full path
              : ExtractFilePaths<T[K], `${CurrentPath}/${K}`> // Directory, recurse
          : never
        : never;
    }[ChildKeys<T>]
  : never;

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
export function createGeneratorRegistry<TSchema extends SchemaNode>(
  _schema: TSchema,
  generators: GeneratorRegistry<TSchema>
): GeneratorRegistry<TSchema> {
  return generators;
}

/**
 * Walk the schema tree and call a visitor for each node.
 */
export function walkSchema(
  node: SchemaNode,
  currentPath: string,
  visitor: (path: string, metadata: NodeMetadata, node: SchemaNode) => void
): void {
  const metadata = node[METADATA_KEY];
  visitor(currentPath, metadata, node);

  // Visit children
  for (const key of Object.keys(node)) {
    if (key === METADATA_KEY.toString()) continue;

    const child = node[key];
    if (child && typeof child === "object" && METADATA_KEY in child) {
      const childPath = currentPath ? `${currentPath}/${key}` : key;
      walkSchema(child as SchemaNode, childPath, visitor);
    }
  }
}

/**
 * Get all file paths from the schema.
 */
export function getFilePaths(schema: SchemaNode): string[] {
  const paths: string[] = [];

  walkSchema(schema, "", (path, metadata) => {
    if (metadata.type === FSType.File && path) {
      paths.push(path);
    }
  });

  return paths;
}

/**
 * Get all directory paths from the schema.
 */
export function getDirectoryPaths(schema: SchemaNode): string[] {
  const paths: string[] = [];

  walkSchema(schema, "", (path, metadata) => {
    if (metadata.type === FSType.Directory && path) {
      paths.push(path);
    }
  });

  return paths;
}

/**
 * Validate that a generator registry covers all files in the schema.
 * This is a runtime check that complements the compile-time type checking.
 */
export function validateRegistry(
  schema: SchemaNode,
  registry: Record<string, GeneratorFn>
): { valid: boolean; missing: string[]; extra: string[] } {
  const schemaPaths = new Set(getFilePaths(schema));
  const registryPaths = new Set(Object.keys(registry));

  const missing = [...schemaPaths].filter((p) => !registryPaths.has(p));
  const extra = [...registryPaths].filter((p) => !schemaPaths.has(p));

  return {
    valid: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}
