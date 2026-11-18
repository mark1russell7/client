/**
 * E2E: a script that embeds the CLI ends by itself after a command (O103).
 *
 * The script runs `main()` of the built CLI in its own process (`fixture-embed.ts`). The runner of
 * the command does not end that process. After the command, no timer stays in the active resources
 * of the event loop, and the process exits with the code of the command.
 *
 * Since version 0.9.0 of `@mark1russell7/service`, each timer of its real clock keeps a process
 * alive. A watch timer that stays after the stop of a command holds the process until it fires. The
 * test finds such a timer without a measure of time: it reads the active resources.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mark } from "./run.js";

/** The script that embeds the CLI. */
const EMBED = fileURLToPath(new URL("./fixture-embed.ts", import.meta.url));

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true, maxRetries: 3 });
});

/** This function gives the active resources that the script wrote after the command. */
function activeResources(stdout: string): string[] {
  const line = stdout.split("\n").find((text) => text.startsWith("ACTIVE "));
  if (line === undefined) throw new Error(`The script wrote no line of active resources. Its output:\n${stdout}`);
  return JSON.parse(line.slice("ACTIVE ".length)) as string[];
}

describe("mark: a script that embeds the CLI ends by itself (O103)", () => {
  it.each([
    ["a command under the runner", ["fs", "read", "hello.txt"], 0],
    ["the version, with no runner", ["--version"], 0],
    ["an unknown command", ["nosuch", "command"], 1],
    ["invalid input under the runner", ["fs", "exists"], 1],
  ])("after %s, no timer keeps the process alive", (_what, args, exitCode) => {
    const cwd = mkdtempSync(join(tmpdir(), "mark-exit-"));
    folders.push(cwd);
    writeFileSync(join(cwd, "hello.txt"), "hello");
    const run = mark(args, { cwd, entry: EMBED });
    expect(run.exitCode, `${run.stdout}\n${run.stderr}`).toBe(exitCode);
    expect(activeResources(run.stdout).filter((resource) => resource === "Timeout" || resource === "Immediate")).toEqual([]);
  });
});
