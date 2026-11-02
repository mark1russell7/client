import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import module from "node:module";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { type CompileCacheApi, compileCacheDir, enableCompileCache } from "./compile-cache.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("compileCacheDir", () => {
  it("uses XDG_CACHE_HOME on Linux, else ~/.cache", () => {
    expect(compileCacheDir("linux", { XDG_CACHE_HOME: "/var/cache/u" }, "/home/u")).toBe("/var/cache/u/mark/compile-cache");
    expect(compileCacheDir("linux", {}, "/home/u")).toBe("/home/u/.cache/mark/compile-cache");
  });

  it("ignores an XDG_CACHE_HOME that is not absolute, as the XDG specification says", () => {
    expect(compileCacheDir("linux", { XDG_CACHE_HOME: "cache" }, "/home/u")).toBe("/home/u/.cache/mark/compile-cache");
  });

  it("uses ~/Library/Caches on macOS", () => {
    expect(compileCacheDir("darwin", { XDG_CACHE_HOME: "/x" }, "/Users/u")).toBe("/Users/u/Library/Caches/mark/compile-cache");
  });

  it("uses LOCALAPPDATA on Windows, else AppData\\Local under the home folder", () => {
    expect(compileCacheDir("win32", { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "C:\\Users\\u")).toBe("C:\\Users\\u\\AppData\\Local\\mark\\compile-cache");
    expect(compileCacheDir("win32", {}, "C:\\Users\\u")).toBe("C:\\Users\\u\\AppData\\Local\\mark\\compile-cache");
  });
});

describe("enableCompileCache", () => {
  it("does nothing on a Node.js with no compile cache", () => {
    expect(enableCompileCache({}, () => "/never")).toBeUndefined();
  });

  it("gives the folder of compileCacheDir() to Node.js", () => {
    const dirs: (string | undefined)[] = [];
    enableCompileCache({ enableCompileCache: (dir) => (dirs.push(dir), { status: 1 }) }, () => "/c/mark/compile-cache");
    expect(dirs).toEqual(["/c/mark/compile-cache"]);
  });

  it("does not throw when Node.js throws", () => {
    expect(
      enableCompileCache({
        enableCompileCache: () => {
          throw new Error("no");
        },
      }),
    ).toBeUndefined();
  });

  it("gives FAILED and exit code 0 for a folder that cannot be written", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "mark-compile-cache-"));
    try {
      const file = path.join(tmp, "a-file");
      writeFileSync(file, "");
      const url = pathToFileURL(path.join(here, "compile-cache.ts")).href;
      const code = `const { enableCompileCache } = await import(${JSON.stringify(url)}); const r = enableCompileCache(undefined, () => ${JSON.stringify(path.join(file, "cache"))}); console.log(JSON.stringify(r ?? null));`;
      const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_COMPILE_CACHE" && k !== "NODE_DISABLE_COMPILE_CACHE"));
      const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env });
      expect(r.status).toBe(0);
      const result = JSON.parse(r.stdout.trim().split("\n").at(-1) ?? "null") as { status: number } | null;
      // Node.js 22.0 has no compile cache: the result is then null
      if (result !== null) expect(result.status).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

/** The result of one process of the tests of a shared cache folder. */
interface Exit {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** This function starts `node <entry>` with a cache folder and the debug log of the cache, and gives its exit. */
function nodeWithCache(entry: string, cache: string): Promise<Exit> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_DISABLE_COMPILE_CACHE"));
  const child = spawn(process.execPath, [entry], { env: { ...env, NODE_COMPILE_CACHE: cache, NODE_DEBUG_NATIVE: "COMPILE_CACHE" } });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  return new Promise((done, fail) => {
    child.once("error", fail);
    child.once("close", (code) => done({ code, stdout, stderr }));
  });
}

/** This function writes an entry that imports `count` modules, and gives the entry and the URL of each module. */
function modulesIn(dir: string, count: number): { entry: string; urls: string[] } {
  const urls: string[] = [];
  const imports: string[] = [];
  for (let i = 0; i < count; i++) {
    const file = path.join(dir, `m${i}.mjs`);
    const body = Array.from({ length: 40 }, (_, k) => `export function f${k}(n) { let s = ${i}; for (let j = 0; j < n; j++) s += j * ${k + 1}; return s; }`).join("\n");
    writeFileSync(file, `${body}\n`);
    urls.push(pathToFileURL(file).href);
    imports.push(`import { f39 as g${i} } from "./m${i}.mjs";`);
  }
  const entry = path.join(dir, "main.mjs");
  writeFileSync(entry, `${imports.join("\n")}\nconsole.log([${Array.from({ length: count }, (_, i) => `g${i}(10)`).join(", ")}].reduce((a, b) => a + b, 0));\n`);
  return { entry, urls: [pathToFileURL(entry).href, ...urls] };
}

/**
 * The file names of the modules that the debug log of the cache gives as hits. Node.js 24 and later write
 * "V8 code cache for ESM <url> was accepted", and Node.js 22 writes "cache for <file> was accepted".
 */
const hitsOf = (stderr: string): string[] => [...stderr.matchAll(/cache for (?:(?:ESM|CommonJS) )?(\S+) was accepted/g)].map((m) => nameOf(m[1] ?? ""));

const nameOf = (urlOrPath: string): string => urlOrPath.split(/[\\/]/).at(-1) ?? "";

const filesUnder = (dir: string): string[] => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));

// Node.js 22.10 and later write each entry to a temporary file, then rename it. Node.js 22.1 to 22.9 write in place,
// and each entry has the size and the hash of the source and of the cache, so Node.js rejects a torn entry.
describe.skipIf(typeof (module as CompileCacheApi).enableCompileCache !== "function")("one cache folder for two processes at the same time", () => {
  it("gives the same output in two writers, and a cache hit for each module in a third process", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "mark-compile-cache-shared-"));
    try {
      const { entry, urls } = modulesIn(tmp, 20);
      const cache = path.join(tmp, "cache");
      const writers = await Promise.all([nodeWithCache(entry, cache), nodeWithCache(entry, cache)]);
      const reader = await nodeWithCache(entry, cache);
      for (const run of [...writers, reader]) expect(run.code, run.stderr).toBe(0);
      expect(writers.map((run) => run.stdout)).toEqual([reader.stdout, reader.stdout]);
      expect(hitsOf(reader.stderr).toSorted()).toEqual(urls.map(nameOf).toSorted());
    } finally {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
    }
  }, 60000);

  it("rejects a torn entry, a short one or one with changed bytes, and gives the same output", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "mark-compile-cache-torn-"));
    try {
      const { entry, urls } = modulesIn(tmp, 4);
      const cache = path.join(tmp, "cache");
      const first = await nodeWithCache(entry, cache);
      expect(first.code, first.stderr).toBe(0);
      const entries = filesUnder(cache);
      expect(entries.length).toBeGreaterThan(1);
      entries.forEach((file, i) => {
        const bytes = readFileSync(file);
        // An entry that a write in place leaves: the first half only, or the full size with other bytes in its body
        writeFileSync(file, i % 2 === 0 ? bytes.subarray(0, Math.floor(bytes.length / 2)) : Buffer.concat([bytes.subarray(0, 20), Buffer.alloc(bytes.length - 20, 0x5a)]));
      });
      const torn = await nodeWithCache(entry, cache);
      expect(torn.code, torn.stderr).toBe(0);
      expect(torn.stdout).toBe(first.stdout);
      expect(hitsOf(torn.stderr)).toEqual([]);
      // The process writes the entries again, so the next process has a hit for each module
      const next = await nodeWithCache(entry, cache);
      expect(hitsOf(next.stderr).toSorted()).toEqual(urls.map(nameOf).toSorted());
    } finally {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
    }
  }, 60000);
});

describe("bin.ts", () => {
  it("enables the cache before the CLI loads: cli.js comes from a dynamic import after the call", () => {
    const source = readFileSync(path.join(here, "bin.ts"), "utf8");
    expect(source).not.toMatch(/^import[^;]*from\s+["']\.\/cli\.js["']/m);
    const enable = source.indexOf("enableCompileCache();");
    expect(enable).toBeGreaterThan(-1);
    expect(source.indexOf('await import("./cli.js")')).toBeGreaterThan(enable);
  });

  it("gives the process to the runner of the command (CLI-26)", () => {
    const source = readFileSync(path.join(here, "bin.ts"), "utf8");
    expect(source).toContain("await main(process.argv.slice(2), { ownsProcess: true });");
  });
});
