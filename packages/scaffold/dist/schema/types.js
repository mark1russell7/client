/**
 * Schema Types
 *
 * Core types for the schema-driven scaffolding system.
 */
import { METADATA_KEY } from "./metadata.js";
/**
 * Filesystem node types
 */
export var FSType;
(function (FSType) {
    FSType["File"] = "file";
    FSType["Directory"] = "directory";
})(FSType || (FSType = {}));
/**
 * Available generator backends
 */
export var Generator;
(function (Generator) {
    /** CUE evaluation (package.json, tsconfig.json, .gitignore) */
    Generator["Cue"] = "cue";
    /** ts-morph AST generation (TypeScript files) */
    Generator["TsMorph"] = "ts-morph";
    /** EJS/Handlebars templates */
    Generator["Template"] = "template";
    /** No generation needed (directories, manual files) */
    Generator["None"] = "none";
})(Generator || (Generator = {}));
/**
 * Features that control which schema entries are active
 */
export var Feature;
(function (Feature) {
    /** Always included */
    Feature["Core"] = "core";
    /** NPM package management */
    Feature["NPM"] = "npm";
    /** TypeScript */
    Feature["TS"] = "ts";
    /** Vitest testing */
    Feature["Vitest"] = "vitest";
    /** React */
    Feature["React"] = "react";
    /** Node.js specific */
    Feature["Node"] = "node";
    /** Vite bundler */
    Feature["Vite"] = "vite";
    /** CUE config */
    Feature["Cue"] = "cue";
})(Feature || (Feature = {}));
//# sourceMappingURL=types.js.map