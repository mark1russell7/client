/**
 * The fresh bundle: a launcher that starts a TypeScript entry from a bundle of the current files on disk.
 *
 * The launcher keeps its builds in a cache folder, for example `node_modules/.cache/<name>`. It starts
 * the last build only when each file of that build has the content hash of the build. Otherwise it
 * makes a new build in a child process and starts it. When the build fails, it starts the source
 * through `tsx`. Thus it does not start code that is older than the source. An edit with the same size
 * and the same modification time also makes the build stale.
 *
 * Import this module from `@procedures/node/fresh-bundle`. The root of the package does not load it.
 * The module needs the optional peer dependencies `esbuild` (for the build) and `tsx` (for the fallback).
 */

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileAtomicSync } from "@procedures/fs/files";
import type { Loader, OnLoadArgs, OnLoadResult, OnResolveArgs, OnResolveResult, Plugin } from "esbuild";

/** The format of the builds. A build of another format is stale. */
const FORMAT = 1;

/** The time after which the next build removes a build that no launch used: 6 hours. */
const UNUSED_MS = 6 * 60 * 60 * 1000;

/** The time limit of a build. A build takes approximately one second. A build that hangs does not stop the call. */
const BUILD_TIMEOUT_MS = 60_000;

/** The file of this module. Each build records its hash, so a new version of the launcher makes a new build. */
const self = fileURLToPath(import.meta.url);

/**
 * The script of the child process that builds. It imports this module, reads the spec from stdin
 * and starts {@link build}. The module itself has no code that starts when it loads.
 */
const BUILD_SCRIPT = [
  `import { build } from ${JSON.stringify(import.meta.url)};`,
  "const chunks = [];",
  "for await (const chunk of process.stdin) chunks.push(chunk);",
  'await build(JSON.parse(Buffer.concat(chunks).toString("utf8")));',
].join("\n");

/** The identifiers that replace `import.meta.url`, `import.meta.dirname` and `import.meta.filename` in a build. */
const META: Readonly<Record<string, string>> = {
  "import.meta.url": "__freshBundleImportMetaUrl",
  "import.meta.dirname": "__freshBundleImportMetaDirname",
  "import.meta.filename": "__freshBundleImportMetaFilename",
};

/** The loader of esbuild for each file extension that is not the name of a loader. */
const LOADERS: Readonly<Record<string, Loader>> = { mts: "ts", cts: "ts", mjs: "js", cjs: "js" };

/** The entry, the cache folder and the inputs of a fresh bundle. */
export interface FreshBundleSpec {
  /** The absolute path of the TypeScript entry. */
  readonly entry: string;
  /** The absolute path of the folder of the builds. Use a folder that Git ignores, for example `node_modules/.cache/<name>`. */
  readonly outDir: string;
  /**
   * The absolute paths of the files that decide a build in addition to the sources: the lockfile,
   * each `package.json` and each `tsconfig.json`. The record of a build marks a missing file as missing.
   */
  readonly inputs: readonly string[];
  /** The module that the build imports esbuild from, as a package name or a file URL. The default is `esbuild`. */
  readonly esbuild?: string;
}

/** The record of the last build, in `current.json` of the cache folder. */
interface CurrentBuild {
  readonly version: number;
  readonly entry: string;
  /** The file of the build that runs, relative to the cache folder. */
  readonly main: string;
  /** The SHA-256 hash of each file of the build, or null for a file that did not exist. */
  readonly inputs: Readonly<Record<string, string | null>>;
}

/** This function gives the SHA-256 hash of bytes or of a text, in hexadecimal. */
const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");

/** This function gives the SHA-256 hash of the content of a file, or null when it cannot read the file. */
const hashOf = (file: string): string | null => {
  try {
    return sha256(readFileSync(file));
  } catch {
    return null;
  }
};

/** This function gives the inputs of the spec and the file of this module. */
const allInputs = (spec: FreshBundleSpec): string[] => [...spec.inputs, self];

/** This function reads `current.json` of the cache folder, or gives undefined when the record is missing or not valid. */
const readCurrent = (outDir: string): CurrentBuild | undefined => {
  try {
    const current: unknown = JSON.parse(readFileSync(join(outDir, "current.json"), "utf8"));
    if (typeof current !== "object" || current === null) return undefined;
    const record = current as Partial<CurrentBuild>;
    if (typeof record.main !== "string" || typeof record.inputs !== "object" || record.inputs === null) {
      return undefined;
    }
    return record as CurrentBuild;
  } catch {
    return undefined;
  }
};

/**
 * This function gives the entry file of a build that has the content of the current files on disk.
 * It gives undefined when there is no build, or when a file changed after the build.
 * @param spec - The entry, the cache folder and the inputs.
 * @returns The absolute path of the entry file of the build, or undefined.
 */
export function freshEntry(spec: FreshBundleSpec): string | undefined {
  const current = readCurrent(spec.outDir);
  if (current === undefined || current.version !== FORMAT || current.entry !== spec.entry) return undefined;
  // A file that the spec names now (the package.json of a new package) is an input that the build must have.
  const files = new Set([...Object.keys(current.inputs), ...allInputs(spec)]);
  for (const file of files) {
    if (!Object.hasOwn(current.inputs, file) || hashOf(file) !== current.inputs[file]) return undefined;
  }
  const main = join(spec.outDir, current.main);
  // A build that a person removed is not a build.
  return statSync(main, { throwIfNoEntry: false })?.isFile() === true ? main : undefined;
}

/**
 * This function gives the URL of the file that Node.js resolves a specifier to from an importer.
 * The parent argument of `import.meta.resolve` needs the flag `--experimental-import-meta-resolve`.
 */
const nodeResolve = (specifier: string, importer: string): string | undefined => {
  try {
    return import.meta.resolve(specifier, pathToFileURL(importer).href);
  } catch {
    return undefined;
  }
};

/**
 * This function makes the esbuild plugin of the build. The plugin keeps each package of
 * `node_modules` external, at the file that Node.js resolves it to from the importer. Thus each
 * package loads at the same version as under `tsx`. The plugin records the hash of each file that
 * esbuild compiles, from the bytes that esbuild compiles. Each file keeps its own `import.meta.url`
 * through a declaration on its first line.
 * @param sources - The map that gets the hash of each compiled file.
 */
const plugin = (sources: Map<string, string>): Plugin => ({
  name: "fresh-bundle",
  setup(builder) {
    builder.onResolve({ filter: /^[^./\\]/ }, (args: OnResolveArgs): OnResolveResult | undefined => {
      if (args.kind === "entry-point") return undefined;
      if (args.path.startsWith("node:")) return { path: args.path, external: true };
      const url = nodeResolve(args.path, args.importer);
      // A specifier that does not resolve here fails where the code imports it, when that code runs, as under tsx.
      if (url === undefined) return { path: args.path, external: true };
      if (!url.startsWith("file:")) return { path: url, external: true };
      const file = fileURLToPath(url);
      const packaged = file.includes(`${sep}node_modules${sep}`) && !/\.[cm]?tsx?$/.test(file);
      return packaged ? { path: url, external: true } : { path: file };
    });
    builder.onLoad({ filter: /.*/ }, (args: OnLoadArgs): OnLoadResult => {
      const bytes = readFileSync(args.path);
      sources.set(args.path, sha256(bytes));
      let text = bytes.toString("utf8");
      if (text.includes("import.meta")) {
        const other = /\bimport\.meta\b(?!\.(?:url|dirname|filename)\b)/.exec(text);
        if (other !== null) {
          throw new Error(`${args.path}: import.meta other than url, dirname or filename`);
        }
        const declared = [
          `${META["import.meta.url"]} = ${JSON.stringify(pathToFileURL(args.path).href)}`,
          `${META["import.meta.dirname"]} = ${JSON.stringify(dirname(args.path))}`,
          `${META["import.meta.filename"]} = ${JSON.stringify(args.path)}`,
        ];
        const line = `var ${declared.join(", ")};`;
        // The declaration goes on the first line (after a hashbang), so the line numbers stay those of the source.
        text = text.startsWith("#!") ? text.replace(/^(#![^\n]*\n)/, `$1${line}`) : line + text;
      }
      const ext = extname(args.path).slice(1);
      return { contents: text, loader: LOADERS[ext] ?? (ext as Loader) };
    });
  },
});

/** This function removes the builds that no launch used recently, and the remains of a build that crashed. */
const prune = (outDir: string, keep: string): void => {
  for (const entry of readdirSync(outDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === keep) continue;
    const path = join(outDir, entry.name);
    try {
      if (Date.now() - statSync(path).mtimeMs > UNUSED_MS) {
        rmSync(path, { recursive: true, force: true });
      }
    } catch {
      // The folder is in use or gone. The next build tries again.
    }
  }
};

/**
 * This function builds the entry into a new folder of the cache folder, and points `current.json` at it.
 * Start it in a process with the flag `--experimental-import-meta-resolve`. {@link launch} does this.
 * @param spec - The entry, the cache folder and the inputs.
 */
export async function build(spec: FreshBundleSpec): Promise<void> {
  const esbuild = (await import(spec.esbuild ?? "esbuild")) as typeof import("esbuild");
  const sources = new Map<string, string>();
  // The hashes come before esbuild reads the files. Thus a change during the build makes the build stale.
  const inputs: Record<string, string | null> = Object.fromEntries(
    allInputs(spec).map((file) => [file, hashOf(file)]),
  );
  mkdirSync(spec.outDir, { recursive: true });
  const tmp = join(spec.outDir, `tmp-${String(process.pid)}-${randomBytes(4).toString("hex")}`);
  try {
    await esbuild.build({
      entryPoints: [spec.entry],
      outdir: tmp,
      bundle: true,
      // The imports of a code path load when that path runs.
      splitting: true,
      format: "esm",
      platform: "node",
      target: "node22",
      outExtension: { ".js": ".mjs" },
      chunkNames: "chunk-[hash]",
      // A bundle renames the names that clash. A class or a function keeps the name that it has under tsx.
      keepNames: true,
      define: { ...META },
      logLevel: "silent",
      plugins: [plugin(sources)],
    });
    Object.assign(inputs, Object.fromEntries(sources));
    const id = sha256(JSON.stringify([FORMAT, Object.entries(inputs).sort()])).slice(0, 16);
    const dir = join(spec.outDir, id);
    try {
      renameSync(tmp, dir);
    } catch (error) {
      // Another launch made the same build first. Its build is this build.
      if (statSync(dir, { throwIfNoEntry: false })?.isDirectory() !== true) throw error;
    }
    const main = join(id, basename(spec.entry).replace(/\.[cm]?tsx?$/, ".mjs"));
    const current: CurrentBuild = { version: FORMAT, entry: spec.entry, main, inputs };
    // A reader does not see a part of the record. On Windows, the rename fails while a reader has the file open, so writeFileAtomicSync tries again.
    writeFileAtomicSync(join(spec.outDir, "current.json"), JSON.stringify(current));
    prune(spec.outDir, id);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** This function writes the error output of a failed build to `build-error.txt` of the cache folder. */
const recordFailure = (outDir: string, text: string): void => {
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "build-error.txt"), text);
  } catch {
    // There is no place for the record. The call continues through tsx.
  }
};

/**
 * This function starts the entry: its fresh build, else a new build, else the source through `tsx`.
 * The entry gets the `process.argv` that it gets under `tsx`: `process.argv[1]` is the entry. An
 * error of the entry is its own. After the bundle starts, the function does not start the entry again.
 * @param spec - The entry, the cache folder and the inputs.
 */
export async function launch(spec: FreshBundleSpec): Promise<void> {
  let main = freshEntry(spec);
  if (main === undefined) {
    const child = spawnSync(
      process.execPath,
      ["--experimental-import-meta-resolve", "--input-type=module", "--eval", BUILD_SCRIPT],
      {
        input: JSON.stringify(spec),
        stdio: ["pipe", "ignore", "pipe"],
        windowsHide: true,
        timeout: BUILD_TIMEOUT_MS,
      },
    );
    if (child.status !== 0) {
      // The record of the last failure tells why the start is slow. The call continues through tsx.
      const stderr = child.stderr?.toString() ?? "";
      recordFailure(spec.outDir, child.error === undefined ? stderr : `${child.error.message}\n${stderr}`);
    }
    main = freshEntry(spec);
  }
  process.argv[1] = spec.entry;
  if (main !== undefined) {
    try {
      // The time of the last use. The next build does not remove a build that is in use.
      const now = new Date();
      utimesSync(dirname(main), now, now);
    } catch {
      // The build is gone or read-only. It runs all the same.
    }
    await import(pathToFileURL(main).href);
    return;
  }
  const { register } = await import("tsx/esm/api");
  register();
  await import(pathToFileURL(spec.entry).href);
}
