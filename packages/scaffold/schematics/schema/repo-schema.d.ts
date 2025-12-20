/**
 * Repository Schema
 *
 * The canonical definition of an ecosystem package structure.
 * This nested structure mirrors the filesystem and is the single
 * source of truth for what files/directories exist in a package.
 */
import { FSType, Generator, Feature } from "./types.js";
/**
 * The canonical repository structure schema.
 *
 * Adding a file here without a corresponding generator will cause
 * a TypeScript compile error in the generator registry.
 */
export declare const REPO_SCHEMA: {
    readonly __$scaffold_meta_01944a8c7d00$__: {
        readonly type: FSType.Directory;
        readonly name: "{{packageName}}";
    };
    readonly "package.json": {
        readonly __$scaffold_meta_01944a8c7d00$__: {
            readonly type: FSType.File;
            readonly generator: Generator.Cue;
            readonly feature: Feature.NPM;
            readonly cueExpr: "npm/package:output";
        };
    };
    readonly "tsconfig.json": {
        readonly __$scaffold_meta_01944a8c7d00$__: {
            readonly type: FSType.File;
            readonly generator: Generator.Cue;
            readonly feature: Feature.TS;
            readonly cueExpr: "ts/config:output";
        };
    };
    readonly ".gitignore": {
        readonly __$scaffold_meta_01944a8c7d00$__: {
            readonly type: FSType.File;
            readonly generator: Generator.Cue;
            readonly feature: Feature.Core;
            readonly cueExpr: "git/ignore:output";
        };
    };
    readonly "dependencies.json": {
        readonly __$scaffold_meta_01944a8c7d00$__: {
            readonly type: FSType.File;
            readonly generator: Generator.Template;
            readonly feature: Feature.Cue;
            readonly template: "dependencies.json.ejs";
        };
    };
    readonly "vitest.config.ts": {
        readonly __$scaffold_meta_01944a8c7d00$__: {
            readonly type: FSType.File;
            readonly generator: Generator.TsMorph;
            readonly feature: Feature.Vitest;
            readonly morphFn: "generateVitestConfig";
        };
    };
    readonly src: {
        readonly __$scaffold_meta_01944a8c7d00$__: {
            readonly type: FSType.Directory;
            readonly always: true;
        };
        readonly "index.ts": {
            readonly __$scaffold_meta_01944a8c7d00$__: {
                readonly type: FSType.File;
                readonly generator: Generator.TsMorph;
                readonly feature: Feature.TS;
                readonly morphFn: "generateIndexTs";
            };
        };
        readonly __tests__: {
            readonly __$scaffold_meta_01944a8c7d00$__: {
                readonly type: FSType.Directory;
                readonly feature: Feature.Vitest;
            };
        };
    };
};
/**
 * Type alias for the schema
 */
export type RepoSchema = typeof REPO_SCHEMA;
//# sourceMappingURL=repo-schema.d.ts.map