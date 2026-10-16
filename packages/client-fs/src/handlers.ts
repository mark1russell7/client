/**
 * The handlers of the file procedures with a root (roadmap R33).
 *
 * `fsModule` has the plain handlers: they operate on each path. `createFsModule({ root })`
 * replaces each handler with the handler of `rootedHandlers(root)`. That handler sends the paths
 * of its input through `inRoot()`, then starts the plain handler with the absolute path.
 */

import { platform } from "node:process";
import { isAbsolute, resolve } from "node:path";
import type { ProcedurePath } from "@procedures/client";
import { read } from "./procedures/fs/read.js";
import { write } from "./procedures/fs/write.js";
import { exists } from "./procedures/fs/exists.js";
import { mkdir } from "./procedures/fs/mkdir.js";
import { rm } from "./procedures/fs/rm.js";
import { readdir } from "./procedures/fs/readdir.js";
import { stat } from "./procedures/fs/stat.js";
import { copy } from "./procedures/fs/copy.js";
import { move } from "./procedures/fs/move.js";
import { glob } from "./procedures/fs/glob.js";
import { readJson } from "./procedures/fs/json.js";
import { inRoot, isOutsideRoot, outsideRoot, realPathIsInside, resolveRoot, type ResolvedRoot } from "./root.js";
import type {
  ReadInput,
  ReadOutput,
  WriteInput,
  WriteOutput,
  ExistsInput,
  ExistsOutput,
  MkdirInput,
  MkdirOutput,
  RmInput,
  RmOutput,
  ReaddirInput,
  ReaddirOutput,
  StatInput,
  StatOutput,
  CopyInput,
  CopyOutput,
  MoveInput,
  MoveOutput,
  GlobInput,
  GlobOutput,
  ReadJsonInput,
  ReadJsonOutput,
} from "./types.js";

/** One handler for each file procedure. */
export interface FsHandlers {
  read: (input: ReadInput) => Promise<ReadOutput>;
  write: (input: WriteInput) => Promise<WriteOutput>;
  exists: (input: ExistsInput) => Promise<ExistsOutput>;
  mkdir: (input: MkdirInput) => Promise<MkdirOutput>;
  rm: (input: RmInput) => Promise<RmOutput>;
  readdir: (input: ReaddirInput) => Promise<ReaddirOutput>;
  stat: (input: StatInput) => Promise<StatOutput>;
  copy: (input: CopyInput) => Promise<CopyOutput>;
  move: (input: MoveInput) => Promise<MoveOutput>;
  glob: (input: GlobInput) => Promise<GlobOutput>;
  readJson: (input: ReadJsonInput) => Promise<ReadJsonOutput>;
}

/**
 * The name of the handler of each procedure, by the key of the procedure. `createFsModule()`
 * refuses a procedure that is not in this list, so a new procedure cannot skip the root.
 */
export const HANDLER_NAMES: Readonly<Record<string, keyof FsHandlers>> = {
  "fs.read": "read",
  "fs.write": "write",
  "fs.exists": "exists",
  "fs.mkdir": "mkdir",
  "fs.rm": "rm",
  "fs.readdir": "readdir",
  "fs.stat": "stat",
  "fs.copy": "copy",
  "fs.move": "move",
  "fs.glob": "glob",
  "fs.read.json": "readJson",
};

/**
 * True for a glob pattern that can match outside its folder: an absolute pattern, a pattern that
 * goes up with `..` (also in a brace or a group), or a pattern that starts with a drive on Windows.
 * The handler also removes each match outside the root, so this check only gives a clear error.
 */
function patternLeavesFolder(pattern: string): boolean {
  if (isAbsolute(pattern) || pattern.startsWith("/") || pattern.startsWith("\\")) return true;
  if (platform === "win32" && /^[a-zA-Z]:/.test(pattern)) return true;
  return pattern.split(/[\\/{},()|]/).includes("..");
}

/**
 * This function gives the handlers that confine each path to `root`. The root is resolved
 * against the working folder of the process when the function starts. It must exist when a
 * procedure starts.
 */
export function rootedHandlers(root: string): FsHandlers {
  const folder = resolve(root);
  /** The root of one call (its real path can change between two calls), and the check of its paths. */
  const check = async (procedure: string): Promise<{ root: ResolvedRoot; inside: (path: string) => Promise<string> }> => {
    const resolved = await resolveRoot(folder);
    const at: ProcedurePath = ["fs", procedure];
    return { root: resolved, inside: (path) => inRoot(resolved, path, at) };
  };

  return {
    read: async (input) => {
      const { inside } = await check("read");
      return read({ ...input, path: await inside(input.path) });
    },
    write: async (input) => {
      const { inside } = await check("write");
      return write({ ...input, path: await inside(input.path) });
    },
    exists: async (input) => {
      const { inside } = await check("exists");
      return exists({ ...input, path: await inside(input.path) });
    },
    mkdir: async (input) => {
      const { inside } = await check("mkdir");
      return mkdir({ ...input, path: await inside(input.path) });
    },
    rm: async (input) => {
      const { inside } = await check("rm");
      return rm({ ...input, path: await inside(input.path) });
    },
    stat: async (input) => {
      const { inside } = await check("stat");
      return stat({ ...input, path: await inside(input.path) });
    },
    readJson: async (input) => {
      const { inside } = await check("read.json");
      return readJson({ ...input, path: await inside(input.path) });
    },
    copy: async (input) => {
      const { inside } = await check("copy");
      return copy({ ...input, src: await inside(input.src), dest: await inside(input.dest) });
    },
    move: async (input) => {
      const { inside } = await check("move");
      return move({ ...input, src: await inside(input.src), dest: await inside(input.dest) });
    },
    readdir: async (input) => {
      const { inside } = await check("readdir");
      // The stats of an entry follow a symlink: an entry whose target is outside the root gets no stats
      const result = await readdir({ ...input, path: await inside(input.path), includeStats: false });
      if (input.includeStats) {
        for (const entry of result.entries) {
          try {
            await inside(entry.path);
          } catch (error) {
            if (isOutsideRoot(error)) continue;
            throw error;
          }
          entry.stats = await stat({ path: entry.path });
        }
      }
      return result;
    },
    glob: async (input) => {
      const { root: resolved, inside } = await check("glob");
      const cwd = await inside(input.cwd ?? ".");
      if (patternLeavesFolder(input.pattern)) {
        throw outsideRoot(["fs", "glob"], `the pattern ${JSON.stringify(input.pattern)} can match outside the folder ${cwd}`);
      }
      // A match through a symlink whose target is outside the root is left out
      const found = await glob({ ...input, cwd, absolute: false });
      const matches: string[] = [];
      for (const match of found.matches) {
        const absolute = resolve(cwd, match);
        if (await realPathIsInside(resolved, absolute)) matches.push(input.absolute ? absolute : match);
      }
      return { pattern: input.pattern, matches };
    },
  };
}
