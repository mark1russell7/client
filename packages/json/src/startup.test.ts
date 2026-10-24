/**
 * The entries `./module` and `./register` do not load the `yaml` package at import (roadmap O50).
 *
 * esbuild bundles each entry from its source file and writes a metafile. The test follows the
 * static imports of the entry and collects the packages that they name. A dynamic `import()` does
 * not count: the YAML procedures load `yaml` when they first start. The root still loads `yaml`,
 * because it exports the synchronous functions `parseYaml` and `stringifyYaml`.
 */

import { build } from "esbuild";
import { describe, expect, it } from "vitest";

/** This function gives the package of an import: `@scope/name` or `name`, without a subpath. */
function packageOf(specifier: string): string {
  return specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
}

/**
 * This function gives the packages that the static imports of a source file reach, and the number
 * of files that it follows. The path of the file is relative to the folder of the package: vitest
 * starts in that folder. The package has no Node types, so the test does not read `import.meta.url`.
 */
async function staticImports(entry: string): Promise<{ packages: Set<string>; files: number }> {
  const { metafile } = await build({ entryPoints: [entry], bundle: true, write: false, metafile: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" });
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

describe("the start of @procedures/json (O50)", () => {
  it.each(["src/module.ts", "src/register.ts"])("%s does not load yaml at import", async (entry) => {
    const { packages, files } = await staticImports(entry);
    expect(files, "the check follows the imports of the entry").toBeGreaterThan(1);
    expect(packages.has("@procedures/client"), "the check sees the packages of the entry").toBe(true);
    expect(packages.has("yaml")).toBe(false);
  });

  it("the check finds the static import of yaml in src/yaml.ts", async () => {
    expect((await staticImports("src/yaml.ts")).packages.has("yaml")).toBe(true);
  });
});
