/**
 * Repository Schema
 *
 * The canonical definition of an ecosystem package structure.
 * This nested structure mirrors the filesystem and is the single
 * source of truth for what files/directories exist in a package.
 */
import { METADATA_KEY } from "./metadata.js";
import { FSType, Generator, Feature } from "./types.js";
/**
 * The canonical repository structure schema.
 *
 * Adding a file here without a corresponding generator will cause
 * a TypeScript compile error in the generator registry.
 */
export const REPO_SCHEMA = {
    [METADATA_KEY]: {
        type: FSType.Directory,
        name: "{{packageName}}",
    },
    "package.json": {
        [METADATA_KEY]: {
            type: FSType.File,
            generator: Generator.Cue,
            feature: Feature.NPM,
            cueExpr: "npm/package:output",
        },
    },
    "tsconfig.json": {
        [METADATA_KEY]: {
            type: FSType.File,
            generator: Generator.Cue,
            feature: Feature.TS,
            cueExpr: "ts/config:output",
        },
    },
    ".gitignore": {
        [METADATA_KEY]: {
            type: FSType.File,
            generator: Generator.Cue,
            feature: Feature.Core,
            cueExpr: "git/ignore:output",
        },
    },
    "dependencies.json": {
        [METADATA_KEY]: {
            type: FSType.File,
            generator: Generator.Template,
            feature: Feature.Cue,
            template: "dependencies.json.ejs",
        },
    },
    "vitest.config.ts": {
        [METADATA_KEY]: {
            type: FSType.File,
            generator: Generator.TsMorph,
            feature: Feature.Vitest,
            morphFn: "generateVitestConfig",
        },
    },
    src: {
        [METADATA_KEY]: {
            type: FSType.Directory,
            always: true,
        },
        "index.ts": {
            [METADATA_KEY]: {
                type: FSType.File,
                generator: Generator.TsMorph,
                feature: Feature.TS,
                morphFn: "generateIndexTs",
            },
        },
        "__tests__": {
            [METADATA_KEY]: {
                type: FSType.Directory,
                feature: Feature.Vitest,
            },
        },
    },
};
//# sourceMappingURL=repo-schema.js.map