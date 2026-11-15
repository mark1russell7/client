/**
 * A wait of the REST client for its limits keeps a Node process alive. A script with a top-level
 * await of two writes ends with its last line. Before, the timer of the wait did not keep the
 * process alive, and Node stopped the script with the exit code 13 of an unsettled top-level await.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The URL of the source of the REST client, for the import of the child script. */
const restModule = new URL("./rest.ts", import.meta.url).href;

/** The root of the repository: `--import tsx` resolves `tsx` from it. */
const root = fileURLToPath(new URL("../../..", import.meta.url));

/** A clock whose timers do not keep a Node process alive, as the old default of the waits. */
const unrefClock = `{ now: () => performance.now(), after: (ms, run) => { const timer = setTimeout(run, ms); timer.unref(); return () => clearTimeout(timer); } }`;

/**
 * This function starts a child script that sends two writes with a top-level await. The limit of
 * the writes is one write in each second, so the second write waits for the clock.
 */
function twoWrites(clock: string | undefined): { status: number | null; stdout: string; stderr: string } {
  const folder = mkdtempSync(join(tmpdir(), "gh-rest-exit-"));
  try {
    const script = join(folder, "two-writes.mts");
    const clockOption = clock === undefined ? "" : `, clock: ${clock}`;
    writeFileSync(
      script,
      [
        `import { createRestClient } from ${JSON.stringify(restModule)};`,
        `const client = createRestClient({ token: "token", transport: async () => ({ status: 201, headers: {}, body: { ok: true } })${clockOption} });`,
        `const signal = new AbortController().signal;`,
        `await client.request({ method: "POST", path: "/one", body: {} }, signal);`,
        `await client.request({ method: "POST", path: "/two", body: {} }, signal);`,
        `console.log("both writes ended");`,
      ].join("\n"),
    );
    const result = spawnSync(process.execPath, ["--import", "tsx", script], { cwd: root, encoding: "utf8", timeout: 30_000 });
    return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

describe("the wait of the REST client for its limits", () => {
  it("keeps the process alive until the second write ends, with the default clock", () => {
    const result = twoWrites(undefined);
    expect(result.stderr).not.toContain("unsettled top-level await");
    expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 0, stdout: "both writes ended" });
  }, 40_000);

  it("stops the script during the wait with a clock of the caller whose timers have unref", () => {
    // This case shows that the script finds the fault: the old default clock gave this result
    const result = twoWrites(unrefClock);
    expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 13, stdout: "" });
    expect(result.stderr).toContain("unsettled top-level await");
  }, 40_000);
});
