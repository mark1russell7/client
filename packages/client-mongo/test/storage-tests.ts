/**
 * The storage tests on a real MongoDB, in two runs. A failpoint is global to the server. The failpoint `failCommand` keeps
 * one setting at a time, so a file that sets it or turns it off changes the failpoint of another file. The failpoint
 * `hangBeforeUpsertPerformsInsert` holds each upsert of the server, and the counters of the store use upserts.
 * So the files that set a failpoint run after the other files, one at a time. No other file operates beside them.
 *
 * Use: `node --import tsx test/storage-tests.ts [folder]`, from the folder of the package. The default folder is `src/storage`.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The text that marks a file that sets a failpoint of the server. */
export const FAILPOINT_MARK = "configureFailPoint";

/** This function divides the test files: the files that start together, and the files that set a failpoint and start alone. */
export function failpointSplit(files: readonly string[], textOf: (file: string) => string): { together: string[]; alone: string[] } {
  const sorted = [...files].sort();
  const alone = sorted.filter((file) => textOf(file).includes(FAILPOINT_MARK));
  return { together: sorted.filter((file) => !alone.includes(file)), alone };
}

/** This function gives the test files of a folder and of its subfolders. */
function testFiles(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => join(folder, name).replaceAll("\\", "/"));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { together, alone } = failpointSplit(testFiles(process.argv[2] ?? "src/storage"), (file) => readFileSync(file, "utf8"));
  const vitest = (args: string[]): number => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...args], { stdio: "inherit" }).status ?? 1;
  console.log(`These files set a failpoint, so they run after the others, one at a time: ${alone.join(", ") || "(none)"}`);
  // Both runs go to the end, so one report gives each failure.
  const first = vitest(together);
  const second = alone.length === 0 ? 0 : vitest(["--no-file-parallelism", ...alone]);
  process.exit(first !== 0 ? first : second);
}
