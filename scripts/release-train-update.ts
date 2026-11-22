#!/usr/bin/env node
/**
 * The script `release-train:update` of the root `package.json`. The release train starts it after the
 * install of each update of the general packages. The train adds the changed files and the new files
 * of the script to the commit of the update.
 *
 * A wrap package has the procedures of one home (direction 40), so an update of a home can change
 * the manifest of its wrap. The script does these steps:
 *
 * 1. It builds `@procedures/compiler`, `@procedures/client` and their dependencies.
 * 2. It starts `node scripts/wraps.ts check`. When the check passes, the update changes no wrap, and
 *    the script stops.
 * 3. When the check fails, the script starts `node scripts/wraps.ts generate`. Then it builds all
 *    packages without the site, and writes `PROCEDURES.md` and `PACKAGES.md` again.
 * 4. It stops with an error when a catalog has a package that did not load.
 * 5. It starts the check again. When the check fails again, the script stops with an error. Then a
 *    person must examine the update: for example, the home removed a function.
 *
 * Run: pnpm run release-train:update
 */

import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { root } from "./lib/workspace.ts";

/** One command of the script. */
export interface Step {
  /** The text of the step in the log and in an error. */
  readonly label: string;
  readonly command: "node" | "pnpm";
  readonly args: readonly string[];
}

/** The build of the generator and of the client, which the check of the wraps needs. */
export const BUILD_TOOLS: Step = {
  label: "the build of @procedures/compiler and @procedures/client",
  command: "pnpm",
  args: ["--filter", "@procedures/compiler...", "--filter", "@procedures/client...", "run", "build"],
};

/** The check of the wraps. */
export const CHECK: Step = { label: "the check of the wraps", command: "node", args: ["scripts/wraps.ts", "check"] };

/** The step that writes the manifests, the ratchets and the results of the programs again. */
export const GENERATE: Step = { label: "the generator of the wraps", command: "node", args: ["scripts/wraps.ts", "generate"] };

/** The build of the packages that the catalogs load. The catalogs do not load the site. */
export const BUILD_PACKAGES: Step = {
  label: "the build of the packages without the site",
  command: "pnpm",
  args: ["--recursive", "--filter", "!@procedures/site", "run", "build"],
};

/** The steps that write the two catalogs from the built packages. */
export const CATALOGS: readonly Step[] = [
  { label: "the catalog of the procedures", command: "node", args: ["packages/documentation/scripts/generate-procedures.ts"] },
  { label: "the catalog of the packages", command: "node", args: ["packages/documentation/scripts/generate-packages.ts"] },
];

/** The files of the catalogs, from the root of the repository. */
export const CATALOG_FILES: readonly string[] = ["packages/documentation/PROCEDURES.md", "packages/documentation/PACKAGES.md"];

/** The result of the script. */
export interface UpdateResult {
  /** The labels of the steps that started, in their sequence. */
  readonly ran: readonly string[];
  /** This value is true when the generator started. */
  readonly generated: boolean;
  /** The problem that stopped the script. Absent: the script passed. */
  readonly error?: string;
}

/** This text is in a catalog when the catalog has a package that did not load. */
const NOT_LOADED = "failed to load";

/**
 * This function does the steps of the script. `run` starts one step and gives its exit code.
 * `readCatalog` gives the text of a catalog file.
 */
export function update(run: (step: Step) => number, readCatalog: (file: string) => string): UpdateResult {
  const ran: string[] = [];
  let generated = false;
  const failed = (step: Step): boolean => {
    ran.push(step.label);
    return run(step) !== 0;
  };
  const stop = (error: string): UpdateResult => ({ ran, generated, error });
  if (failed(BUILD_TOOLS)) return stop(`${BUILD_TOOLS.label} fails`);
  if (!failed(CHECK)) return { ran, generated };
  generated = true;
  for (const step of [GENERATE, BUILD_PACKAGES, ...CATALOGS]) if (failed(step)) return stop(`${step.label} fails`);
  const partial = CATALOG_FILES.filter((file) => readCatalog(file).includes(NOT_LOADED));
  if (partial.length > 0) return stop(`${partial.join(" and ")} has a package that did not load`);
  if (failed(CHECK)) return stop(`${CHECK.label} fails after the generator: a person must examine the update`);
  return { ran, generated };
}

/** The program, the arguments and the shell option that start a step. */
export interface CommandLine {
  readonly file: string;
  readonly args: readonly string[];
  readonly shell: boolean;
}

/**
 * This function gives the command line of a step. A `pnpm` step uses the pnpm that started the
 * script (`npm_execpath`). Without it, the step starts `pnpm`, through a shell on Windows.
 */
export function commandLine(step: Step, node: string, execPath: string | undefined, platform: string): CommandLine {
  if (step.command === "node") return { file: node, args: step.args, shell: false };
  if (execPath !== undefined && /pnpm/i.test(execPath) && /\.[cm]?js$/.test(execPath)) return { file: node, args: [execPath, ...step.args], shell: false };
  return { file: "pnpm", args: step.args, shell: platform === "win32" };
}

/** This function starts a step in the root of the repository, with the output of the step in the log. */
function runStep(step: Step): number {
  const line = commandLine(step, process.execPath, process.env["npm_execpath"], process.platform);
  console.log(`release-train:update: ${step.label}: ${step.command} ${step.args.join(" ")}`);
  const result = spawnSync(line.file, line.args, { cwd: root, stdio: "inherit", shell: line.shell });
  if (result.error !== undefined) console.error(String(result.error));
  return result.status ?? 1;
}

function main(): number {
  const result = update(runStep, (file) => readFileSync(join(root, file), "utf8"));
  if (result.error !== undefined) {
    console.error(`release-train:update: ${result.error}`);
    return 1;
  }
  console.log(
    result.generated
      ? "release-train:update: the generator wrote the wraps and the catalogs again, and the check passes."
      : "release-train:update: the check passes, so the update changes no wrap.",
  );
  return 0;
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
