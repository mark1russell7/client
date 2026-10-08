/**
 * Generator Registry
 *
 * The type-enforced registry of generators for all schema files.
 * Adding a file to REPO_SCHEMA without adding it here causes
 * a TypeScript compile error.
 */
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
export declare const generators: import("../schema/validators.js").GeneratorRegistry<{
    readonly __$scaffold_meta_01944a8c7d00$__: {
        readonly type: import("../index.js").FSType.Directory;
        readonly name: "{{packageName}}";
    };
    readonly "package.json": {
        readonly __$scaffold_meta_01944a8c7d00$__: {
            readonly type: import("../index.js").FSType.File;
            readonly generator: import("../index.js").Generator.Cue;
            readonly feature: import("../index.js").Feature.NPM;
            readonly cueExpr: "npm/package:output";
        };
    };
    readonly "tsconfig.json": {
        readonly __$scaffold_meta_01944a8c7d00$__: {
            readonly type: import("../index.js").FSType.File;
            readonly generator: import("../index.js").Generator.Cue;
            readonly feature: import("../index.js").Feature.TS;
            readonly cueExpr: "ts/config:output";
        };
    };
    readonly ".gitignore": {
        readonly __$scaffold_meta_01944a8c7d00$__: {
            readonly type: import("../index.js").FSType.File;
            readonly generator: import("../index.js").Generator.Cue;
            readonly feature: import("../index.js").Feature.Core;
            readonly cueExpr: "git/ignore:output";
        };
    };
    readonly "dependencies.json": {
        readonly __$scaffold_meta_01944a8c7d00$__: {
            readonly type: import("../index.js").FSType.File;
            readonly generator: import("../index.js").Generator.Template;
            readonly feature: import("../index.js").Feature.Cue;
            readonly template: "dependencies.json.ejs";
        };
    };
    readonly "vitest.config.ts": {
        readonly __$scaffold_meta_01944a8c7d00$__: {
            readonly type: import("../index.js").FSType.File;
            readonly generator: import("../index.js").Generator.TsMorph;
            readonly feature: import("../index.js").Feature.Vitest;
            readonly morphFn: "generateVitestConfig";
        };
    };
    readonly src: {
        readonly __$scaffold_meta_01944a8c7d00$__: {
            readonly type: import("../index.js").FSType.Directory;
            readonly always: true;
        };
        readonly "index.ts": {
            readonly __$scaffold_meta_01944a8c7d00$__: {
                readonly type: import("../index.js").FSType.File;
                readonly generator: import("../index.js").Generator.TsMorph;
                readonly feature: import("../index.js").Feature.TS;
                readonly morphFn: "generateIndexTs";
            };
        };
        readonly __tests__: {
            readonly __$scaffold_meta_01944a8c7d00$__: {
                readonly type: import("../index.js").FSType.Directory;
                readonly feature: import("../index.js").Feature.Vitest;
            };
        };
    };
}>;
/**
 * Get a generator by path
 */
export declare function getGenerator(path: string): typeof generators[keyof typeof generators] | undefined;
//# sourceMappingURL=registry.d.ts.map