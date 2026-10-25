/**
 * The entries of `@procedures/client` other than `./node` do not load `ws` or `express` at import
 * (roadmap O50). CLI-6 step 2 moved the server transports to `./node`. This test keeps it so.
 *
 * esbuild bundles each entry from its source file and writes a metafile. The test follows the
 * static imports of the entry and collects the packages that they name. A dynamic `import()` does
 * not count, because it loads a package only at its first use.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));

/** The exports map of the package: each subpath and its file for the condition `import`. */
const EXPORTS = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { exports: Record<string, { import: string }> }).exports;

/** This function gives the source file of an entry: `./dist/x/index.js` becomes `src/x/index.ts`. */
function sourceOf(subpath: string): string {
  return EXPORTS[subpath]!.import.replace(/^\.\/dist\//, "src/").replace(/\.js$/, ".ts");
}

/** This function gives the package of an import: `@scope/name` or `name`, without a subpath. */
function packageOf(specifier: string): string {
  return specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
}

/** This function gives the packages that the static imports of a source file reach, and the number of files that it follows. */
async function staticImports(entry: string): Promise<{ packages: Set<string>; files: number }> {
  const { metafile } = await build({ absWorkingDir: PACKAGE, entryPoints: [entry], bundle: true, write: false, metafile: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" });
  expect(metafile.inputs[entry], `the metafile has the entry ${entry}`).toBeDefined();
  const packages = new Set<string>();
  const seen = new Set([entry]);
  const queue = [entry];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    for (const imported of metafile.inputs[file]?.imports ?? []) {
      if (imported.kind === "dynamic-import") continue;
      if (imported.external) packages.add(packageOf(imported.path));
      else if (!seen.has(imported.path)) {
        seen.add(imported.path);
        queue.push(imported.path);
      }
    }
  }
  return { packages, files: seen.size };
}

const ENTRIES = Object.keys(EXPORTS).filter((subpath) => subpath !== "./node");

describe("the start of @procedures/client (O50)", () => {
  it("examines the root and the other entries", () => {
    expect(ENTRIES).toContain(".");
    expect(ENTRIES.length).toBeGreaterThan(5);
  });

  it.each(ENTRIES)("%s does not load ws or express at import", async (subpath) => {
    const { packages, files } = await staticImports(sourceOf(subpath));
    expect(files, "the check follows the imports of the entry").toBeGreaterThan(1);
    expect(packages.has("ws")).toBe(false);
    expect(packages.has("express")).toBe(false);
  });

  it("the check finds ws in ./node", async () => {
    expect((await staticImports(sourceOf("./node"))).packages.has("ws")).toBe(true);
  });
});
