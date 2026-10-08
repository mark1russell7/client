/**
 * Generator Registry
 *
 * The type-enforced registry of generators for all schema files.
 * Adding a file to REPO_SCHEMA without adding it here causes
 * a TypeScript compile error.
 */
import { REPO_SCHEMA } from "../schema/repo-schema.js";
import { createGeneratorRegistry } from "../schema/validators.js";
import { cueGenerator } from "./cue.js";
import { generateVitestConfig, generateIndexTs } from "./ts-morph.js";
import { templateGenerator } from "./template.js";
/**
 * The generator registry for REPO_SCHEMA.
 *
 * TypeScript WILL ERROR if any file path is missing from this object.
 * This is the key enforcement mechanism of the schema-driven system.
 *
 * @example Adding a new file:
 * 1. Add to REPO_SCHEMA in repo-schema.ts
 * 2. TypeScript will error here with "Property 'your-file.ts' is missing"
 * 3. Add the generator here to fix the error
 */
export const generators = createGeneratorRegistry(REPO_SCHEMA, {
    // CUE-generated files (delegates to cue-config)
    "package.json": cueGenerator("npm/package:output"),
    "tsconfig.json": cueGenerator("ts/config:output"),
    ".gitignore": cueGenerator("git/ignore:output"),
    // Template-generated files
    "dependencies.json": templateGenerator("dependencies.json.ejs"),
    // ts-morph generated TypeScript files
    "vitest.config.ts": generateVitestConfig,
    "src/index.ts": generateIndexTs,
});
/**
 * Get a generator by path
 */
export function getGenerator(path) {
    return generators[path];
}
//# sourceMappingURL=registry.js.map