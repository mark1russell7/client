/**
 * The size report of the Web Workers of the site (roadmap O95): for each worker chunk, the bytes
 * of each folder of a package, as Rollup renders them before the minifier.
 */

import type { Plugin } from "vite";

/** One module of a chunk: its id and its length after Rollup removes the unused code. */
export interface RenderedModule {
  readonly id: string;
  readonly renderedLength: number;
}

/** One line of the report: a folder of a package and the bytes of its modules in a chunk. */
export interface FolderSize {
  readonly folder: string;
  readonly bytes: number;
}

/**
 * This function gives the folder of a module for the report: the path after the last
 * `node_modules/` or `packages/`, without the file name, with at most three segments (four for a
 * scoped package). A virtual module (`\0` at the start) is in the folder "virtual".
 */
export function folderOf(id: string): string {
  if (id.startsWith("\0")) return "virtual";
  const path = id.split("?")[0]!.split("\\").join("/");
  let start = 0;
  for (const marker of ["/node_modules/", "/packages/"]) {
    const at = path.lastIndexOf(marker);
    if (at >= 0) start = Math.max(start, at + marker.length);
  }
  const segments = path.slice(start).split("/").slice(0, -1);
  const depth = segments[0]?.startsWith("@") ? 4 : 3;
  return segments.slice(0, depth).join("/") || "(root)";
}

/** This function adds the bytes of the modules of each folder, largest first. */
export function sizeByFolder(modules: readonly RenderedModule[]): FolderSize[] {
  const sizes = new Map<string, number>();
  for (const module of modules) sizes.set(folderOf(module.id), (sizes.get(folderOf(module.id)) ?? 0) + module.renderedLength);
  return [...sizes].map(([folder, bytes]) => ({ folder, bytes })).sort((a, b) => b.bytes - a.bytes || a.folder.localeCompare(b.folder));
}

/** The number of folders that the report gives for each worker chunk. */
const LINES = 15;

/** This function gives the Vite plugin that logs the report of each worker chunk after its build. */
export function moduleSizePlugin(): Plugin {
  return {
    name: "site:module-size",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        const modules = Object.entries(chunk.modules).map(([id, info]) => ({ id, renderedLength: info.renderedLength }));
        const sizes = sizeByFolder(modules);
        const total = sizes.reduce((sum, size) => sum + size.bytes, 0);
        console.log(`size report of the worker ${chunk.fileName}: ${total} bytes before the minifier, in ${modules.length} modules`);
        for (const size of sizes.slice(0, LINES)) console.log(`  ${String(size.bytes).padStart(8)} ${size.folder}`);
      }
    },
  };
}
