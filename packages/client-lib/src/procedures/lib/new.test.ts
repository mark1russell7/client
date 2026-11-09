/**
 * lib.new end to end in a temporary workspace: the new package passes the conventions rule `pack-no-buildinfo`.
 *
 * A fake cue CLI in the workspace writes the files of a cue version. The tsconfig writes the build info file of tsc in
 * `dist`. The field `files` of cue 2.1.2 is `["dist", "src"]`, and cue 2.1.3 adds `!dist/.tsbuildinfo`. The real CLI
 * needs the `cue` program, so the test does not start it.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecks, type RuleResult } from "@mark1russell7/conventions";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { libModule } from "../../module.js";
import type { LibNewOutput } from "../../types.js";

const root = mkdtempSync(join(tmpdir(), "client-lib-new-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** The fake cue CLI: `init` writes `dependencies.json`, and `generate` writes the field `files` of `cue-files.json`. */
const FAKE_CUE = [
  'const { readFileSync, writeFileSync } = require("node:fs");',
  'const { join } = require("node:path");',
  'const json = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + "\\n");',
  'if (process.argv[2] === "init") json("dependencies.json", { features: ["ts"] });',
  'if (process.argv[2] === "generate") {',
  '  const files = JSON.parse(readFileSync(join("..", "..", "cue-files.json"), "utf8"));',
  '  json("package.json", { name: "unnamed", version: "0.1.0", type: "module", files });',
  '  const options = { composite: true, incremental: true, outDir: "${configDir}/dist", rootDir: "${configDir}/src", tsBuildInfoFile: "${configDir}/dist/.tsbuildinfo" };',
  '  json("tsconfig.json", { compilerOptions: options });',
  '  writeFileSync(".gitignore", "dist\\n");',
  "}",
  "",
].join("\n");

writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "workspace", private: true })}\n`);
mkdirSync(join(root, "packages"));
mkdirSync(join(root, "node_modules", "@mark1russell7", "cue", "dist"), { recursive: true });
writeFileSync(join(root, "node_modules", "@mark1russell7", "cue", "dist", "cli.js"), FAKE_CUE);

/** A registry with only the module of this package: the module brings each module that lib.new calls. */
const registry = createRegistry(libModule);

function check(): RuleResult {
  const result = runChecks({ root, only: ["pack-no-buildinfo"], today: "2026-12-01" }).rules[0];
  if (result === undefined) throw new Error("the rule pack-no-buildinfo gave no result");
  return result;
}

/** This function starts lib.new with the field `files` of a cue version, and gives the path of the new manifest. */
async function libNew(name: string, cueFiles: string[]): Promise<string> {
  writeFileSync(join(root, "cue-files.json"), JSON.stringify(cueFiles));
  const result = outputValue(await invokePath<LibNewOutput>(["lib", "new"], { name, rootPath: root }, { registry }));
  expect(result.errors).toEqual([]);
  expect(result.success).toBe(true);
  return join(root, "packages", name, "package.json");
}

function manifestOf(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("lib.new", () => {
  it("writes a package that passes the conventions rule pack-no-buildinfo with the files of cue 2.1.2", async () => {
    const manifestPath = await libNew("fresh", ["dist", "src"]);
    const manifest = manifestOf(manifestPath);
    expect(manifest["name"]).toBe("@procedures/fresh");
    expect(manifest["files"]).toEqual(["dist", "!dist/.tsbuildinfo", "src"]);
    expect(check().status).toBe("pass");

    // The rule breaks on the files of cue 2.1.2 alone, so a regression of lib.new fails this test
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, files: ["dist", "src"] }, null, 2)}\n`);
    expect(check().status).toBe("break");
    rmSync(join(root, "packages", "fresh"), { recursive: true, force: true });
  });

  it("keeps one negation with the files of cue 2.1.3", async () => {
    const manifestPath = await libNew("current", ["dist", "!dist/.tsbuildinfo", "src"]);
    expect(manifestOf(manifestPath)["files"]).toEqual(["dist", "!dist/.tsbuildinfo", "src"]);
    expect(check().status).toBe("pass");
  });
});
