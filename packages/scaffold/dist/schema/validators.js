/**
 * Schema Validators
 *
 * TypeScript type-level utilities that enforce compile-time completeness
 * of generator registries. Adding a file to REPO_SCHEMA without a
 * corresponding generator causes a TypeScript error.
 */
import { METADATA_KEY } from "./metadata.js";
import { FSType } from "./types.js";
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
export function createGeneratorRegistry(_schema, generators) {
    return generators;
}
/**
 * Walk the schema tree and call a visitor for each node.
 */
export function walkSchema(node, currentPath, visitor) {
    const metadata = node[METADATA_KEY];
    visitor(currentPath, metadata, node);
    // Visit children
    for (const key of Object.keys(node)) {
        if (key === METADATA_KEY.toString())
            continue;
        const child = node[key];
        if (child && typeof child === "object" && METADATA_KEY in child) {
            const childPath = currentPath ? `${currentPath}/${key}` : key;
            walkSchema(child, childPath, visitor);
        }
    }
}
/**
 * Get all file paths from the schema.
 */
export function getFilePaths(schema) {
    const paths = [];
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
export function getDirectoryPaths(schema) {
    const paths = [];
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
export function validateRegistry(schema, registry) {
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
//# sourceMappingURL=validators.js.map