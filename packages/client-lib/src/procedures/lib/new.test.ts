/**
 * lib.new end to end in a temporary workspace: the new package passes the conventions rule `pack-no-buildinfo`.
 *
 * A fake cue CLI in the workspace writes the files of cue 2.1.2. Its field `files` is `["dist", "src"]`, and its
 * tsconfig writes the build info file of tsc in `dist`. The real CLI needs the `cue` program, so the test does not
 * start it.
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

/** The fake cue CLI: `init` writes `dependencies.json`, and `generate` writes the files of cue 2.1.2. */
const FAKE_CUE = [
  'const { writeFileSync } = require("node:fs");',
  'const json = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + "\\n");',
  'if (process.argv[2] === "init") json("dependencies.json", { features: ["ts"] });',
  'if (process.argv[2] === "generate") {',
  '  json("package.json", { name: "unnamed", version: "0.1.0", type: "module", files: ["dist", "src"] });',
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

describe("lib.new", () => {
  it("writes a package that passes the conventions rule pack-no-buildinfo", async () => {
    const result = outputValue(await invokePath<LibNewOutput>(["lib", "new"], { name: "fresh", rootPath: root }, { registry }));
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);

    const manifestPath = join(root, "packages", "fresh", "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    expect(manifest["name"]).toBe("@procedures/fresh");
    expect(manifest["files"]).toEqual(["dist", "!dist/.tsbuildinfo", "src"]);
    expect(check().status).toBe("pass");

    // The rule breaks on the files of the fake cue alone, so a regression of lib.new fails this test
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, files: ["dist", "src"] }, null, 2)}\n`);
    expect(check().status).toBe("break");
  });
});
