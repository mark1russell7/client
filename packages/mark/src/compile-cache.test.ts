import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { compileCacheDir, enableCompileCache } from "./compile-cache.js";

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
