/**
 * Shared utilities for cue procedures
 *
 * Uses ctx.client.call() for file system operations (dogfooding).
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { FeaturesManifest } from "./types.js";
export declare const packageRoot: string;
export declare const TSCONFIG_PRIORITY: readonly string[];
export declare function fileExists(path: string, ctx: ProcedureContext): Promise<boolean>;
export declare function readFile(path: string, ctx: ProcedureContext): Promise<string | null>;
export declare function writeFile(path: string, content: string, ctx: ProcedureContext): Promise<boolean>;
export declare function mkdir(path: string, ctx: ProcedureContext): Promise<boolean>;
export declare function readJson<T>(path: string, ctx: ProcedureContext): Promise<T | null>;
export declare function writeJson<T>(path: string, data: T, ctx: ProcedureContext): Promise<boolean>;
export declare function loadFeatures(ctx: ProcedureContext): Promise<FeaturesManifest | null>;
export declare function loadDependencies(projectPath: string, ctx: ProcedureContext): Promise<string[] | null>;
export declare function saveDependencies(deps: string[], projectPath: string, ctx: ProcedureContext): Promise<boolean>;
export declare function resolveFeatures(requested: string[], manifest: FeaturesManifest): string[];
export declare function featureToFieldName(feature: string): string;
export declare function checkCue(): boolean;
export declare function determineTsconfig(resolvedFeatures: string[]): string;
//# sourceMappingURL=shared.d.ts.map