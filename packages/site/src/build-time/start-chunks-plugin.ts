/**
 * The check of the start chunks of the site. Each page loads the entry chunk and each chunk that
 * the entry chunk imports statically. The catalog of the procedures and the list of the packages
 * grow with each library that becomes procedures (direction 40). Thus they must not be in a
 * start chunk: only the pages that show procedures or packages load them.
 *
 * Before this check, the main bundle held the catalog: 585 procedures, and each wrap of a library
 * made each page larger (the geo wrap put the largest page 846 bytes over its budget).
 */

import type { Plugin } from "vite";

/** The generated modules that no start chunk can hold. */
export const LAZY_MODULES: readonly RegExp[] = [/\/src\/data\/generated\/catalog\.js$/, /\/src\/data\/generated\/packages\.js$/];

/** One chunk of the bundle: its file, its entry flag, the chunks that it imports statically and its modules. */
export interface ChunkNode {
  readonly fileName: string;
  readonly isEntry: boolean;
  readonly imports: readonly string[];
  readonly modules: readonly string[];
}

/** One module of a start chunk that no start chunk can hold. */
export interface EagerModule {
  readonly chunk: string;
  readonly module: string;
}

/** This function gives the start chunks: each entry chunk and each chunk that a start chunk imports statically. */
export function startChunks(chunks: readonly ChunkNode[]): string[] {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const start = new Set<string>();
  const queue = chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName);
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (start.has(name)) continue;
    start.add(name);
    queue.push(...(byName.get(name)?.imports ?? []));
  }
  return [...start].sort();
}

/** This function gives each module of a start chunk that matches a lazy pattern. A module id can have Windows separators. */
export function eagerModules(chunks: readonly ChunkNode[], patterns: readonly RegExp[] = LAZY_MODULES): EagerModule[] {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const found: EagerModule[] = [];
  for (const name of startChunks(chunks)) {
    for (const id of byName.get(name)?.modules ?? []) {
      const module = id.split("?")[0]!.split("\\").join("/");
      if (patterns.some((pattern) => pattern.test(module))) found.push({ chunk: name, module });
    }
  }
  return found;
}

/** This function gives the Vite plugin that stops the build when a start chunk holds a lazy module. */
export function startChunksPlugin(): Plugin {
  return {
    name: "site:start-chunks",
    apply: "build",
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).flatMap((chunk) =>
        chunk.type === "chunk" ? [{ fileName: chunk.fileName, isEntry: chunk.isEntry, imports: chunk.imports, modules: Object.keys(chunk.modules) }] : [],
      );
      const found = eagerModules(chunks);
      if (found.length === 0) return;
      this.error(
        [
          "Each page loads these modules, but only the pages that show procedures or packages can load them:",
          ...found.map((entry) => `  ${entry.module} in the start chunk ${entry.chunk}`),
          "Import the facts of each page from src/data/site.ts. Import src/data/index.ts only in a page that loads with its own code.",
        ].join("\n"),
      );
    },
  };
}
