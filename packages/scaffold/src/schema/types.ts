/**
 * Schema Types
 *
 * Core types for the schema-driven scaffolding system.
 */

import { METADATA_KEY } from "./metadata.js";

/**
 * Filesystem node types
 */
export enum FSType {
  File = "file",
  Directory = "directory",
}

/**
 * Available generator backends
 */
export enum Generator {
  /** CUE evaluation (package.json, tsconfig.json, .gitignore) */
  Cue = "cue",
  /** ts-morph AST generation (TypeScript files) */
  TsMorph = "ts-morph",
  /** EJS/Handlebars templates */
  Template = "template",
  /** No generation needed (directories, manual files) */
  None = "none",
}

/**
 * Features that control which schema entries are active
 */
export enum Feature {
  /** Always included */
  Core = "core",
  /** NPM package management */
  NPM = "npm",
  /** TypeScript */
  TS = "ts",
  /** Vitest testing */
  Vitest = "vitest",
  /** React */
  React = "react",
  /** Node.js specific */
  Node = "node",
  /** Vite bundler */
  Vite = "vite",
  /** CUE config */
  Cue = "cue",
}

/**
 * File metadata - attached to file entries
 */
export interface FileMetadata {
  type: FSType.File;
  generator: Generator;
  feature?: Feature | undefined;
  /** ts-morph generator function name (for Generator.TsMorph) */
  morphFn?: string | undefined;
  /** CUE expression (for Generator.Cue) */
  cueExpr?: string | undefined;
  /** Template path (for Generator.Template) */
  template?: string | undefined;
}

/**
 * Directory metadata - attached to directory entries
 */
export interface DirectoryMetadata {
  type: FSType.Directory;
  /** Directory name (for root, uses template variable) */
  name?: string | undefined;
  /** Feature that controls this directory */
  feature?: Feature | undefined;
  /** Always create this directory regardless of features */
  always?: boolean | undefined;
}

/**
 * Union of all node metadata types
 */
export type NodeMetadata = FileMetadata | DirectoryMetadata;

/**
 * A schema node with metadata and optional children
 */
export interface SchemaNode {
  [METADATA_KEY]: NodeMetadata;
  [key: string]: SchemaNode | NodeMetadata;
}

/**
 * Context passed to generators
 */
export interface GeneratorContext {
  /** Package name (e.g., "scaffold") */
  packageName: string;
  /** Full package name (e.g., "@mark1russell7/scaffold") */
  fullPackageName: string;
  /** Active features for this generation */
  features: Set<Feature>;
  /** Preset name (e.g., "lib") */
  preset: string;
  /** Root path for the package */
  rootPath: string;
}

/**
 * Generator function type
 */
export type GeneratorFn = (
  path: string,
  context: GeneratorContext
) => Promise<string> | string;
