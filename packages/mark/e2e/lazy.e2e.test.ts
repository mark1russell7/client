/**
 * E2E: the gate of the lazy registry (roadmap O93). One call of a core procedure through the built
 * bin loads only what the call needs. The test examines the modules that the process loads, not
 * the time, so the result does not depend on the machine.
 *
 * A hook (`module-hook.ts`, with `--import`) records the URL of each module. The test then finds
 * the package of each module: the package folder of the workspace, or the last `node_modules`
 * folder of the path.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BIN } from "./run.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGES = resolve(HERE, "..", "..");
const HOOK = pathToFileURL(join(HERE, "module-hook.ts")).href;

/** The heavy packages that a call of a core procedure must not load. */
const FORBIDDEN = [/^mongodb$/, /^@aws-sdk\//, /^@smithy\//, /^ts-morph$/, /^yaml$/, /^ws$/, /^cli-table3$/];

/**
 * The packages of the workspace that the call can load, each with its reason. The others, the
 * packages of the procedures, load only for a call of their paths.
 */
const ALLOWED_WORKSPACE = new Map<string, string>([
  ["@procedures/client", "the core procedures and the lazy registry"],
  ["@procedures/mark", "the CLI"],
  ["@procedures/cli-kit", "a static import of cli.ts: the parser of the command line and the help"],
  ["@procedures/fs", "a static import of cli.ts: `@procedures/fs/files` writes the manifest"],
  ["@procedures/lib", "a static import of cli.ts: `@procedures/lib/cli-flags` of the flag parser"],
  ["@procedures/peer", "a static import of cli.ts (`@procedures/peer/lockfile`) and the local face of the cold host"],
  ["@procedures/server", "the cold host of a command (`runProcedureHost()`, CLI-26)"],
]);

/** The name of the package of each folder of the workspace. */
function workspaceNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const folder of readdirSync(PACKAGES)) {
    try {
      const pkg = JSON.parse(readFileSync(join(PACKAGES, folder, "package.json"), "utf8")) as { name?: string };
      if (pkg.name) names.set(folder, pkg.name);
    } catch {
      // A folder without a package.json is not a package
    }
  }
  return names;
}

/** The package of a module URL, or undefined for a module of Node. */
function packageOf(url: string, names: ReadonlyMap<string, string>): string | undefined {
  if (!url.startsWith("file:")) return undefined;
  const file = fileURLToPath(url).replaceAll("\\", "/");
  const marker = "/node_modules/";
  const at = file.lastIndexOf(marker);
  if (at >= 0) {
    const segments = file.slice(at + marker.length).split("/");
    return segments[0]!.startsWith("@") ? `${segments[0]}/${segments[1]}` : segments[0];
  }
  const root = PACKAGES.replaceAll("\\", "/") + "/";
  if (file.startsWith(root)) {
    const folder = file.slice(root.length).split("/")[0]!;
    return names.get(folder) ?? `(workspace folder ${folder})`;
  }
  return "(outside the workspace)";
}

describe("mark: one call loads only what it needs (roadmap O93)", () => {
  it("loads no heavy package and no package of procedures for client.add", () => {
    const home = mkdtempSync(join(tmpdir(), "mark-lazy-home-"));
    const record = join(home, "modules.json");
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, FORCE_COLOR: "0", NO_COLOR: "1" };
    // No auto-warm: the run starts no background host
    delete env.MARK_AUTO_WARM;
    try {
      // A first run writes the manifest when it is stale: the gate measures the run with a fresh manifest
      const first = spawnSync(process.execPath, [BIN, "--version"], { encoding: "utf8", timeout: 120000, env });
      expect(first.status, first.stderr).toBe(0);

      const run = spawnSync(process.execPath, ["--import", HOOK, BIN, "--json", '{"$proc":["client","add"],"input":{"a":1,"b":2}}'], {
        encoding: "utf8",
        timeout: 120000,
        env: { ...env, MARK_MODULE_RECORD: record },
      });
      expect(run.status, run.stderr).toBe(0);
      expect(JSON.parse(run.stdout)).toBe(3);
      // Each package that the call loads loads without a warning
      expect(run.stderr).not.toMatch(/did not load|has no package/);

      const names = workspaceNames();
      const urls = JSON.parse(readFileSync(record, "utf8")) as string[];
      const packages = new Set(urls.map((url) => packageOf(url, names)).filter((name): name is string => name !== undefined));

      const forbidden = [...packages].filter((name) => FORBIDDEN.some((pattern) => pattern.test(name)));
      expect(forbidden, "heavy packages that the call loaded").toEqual([]);
      const workspace = [...packages].filter((name) => name.startsWith("@procedures/") && !ALLOWED_WORKSPACE.has(name));
      expect(workspace, "packages of procedures that the call loaded").toEqual([]);
      expect([...packages].filter((name) => name.startsWith("("))).toEqual([]);

      // The record of the run: the count of distinct packages and their names
      console.log(`O93 gate: ${packages.size} distinct packages, ${urls.length} modules: ${[...packages].sort().join(", ")}`);
      expect(packages.size).toBeGreaterThan(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
