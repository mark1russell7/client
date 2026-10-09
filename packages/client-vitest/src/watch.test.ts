/**
 * vitest.watch starts a process that vitest.list shows and vitest.stop ends (deep dive WRP-4).
 * Before, vitest.watch started a detached process and returned only its pid: nothing could
 * stop it, and it kept running after the host ended.
 */

import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vitestWatch } from "./procedures/vitest/watch.js";
import { vitestStop } from "./procedures/vitest/stop.js";
import { vitestList } from "./procedures/vitest/list.js";

const cwd = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "project");
const ctx = { metadata: {} };

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("vitest.watch, vitest.list and vitest.stop", () => {
  it("start, show and stop a watch process", async () => {
    const started = await vitestWatch({ cwd, include: ["sum"] }, ctx);
    expect(started.status).toBe("started");
    expect(started.id).toMatch(/^vitest-/);

    const listed = await vitestList({}, ctx);
    expect(listed.processes).toContainEqual(expect.objectContaining({ id: started.id, pid: started.pid, status: "running" }));

    // The first run of the tests appears in the output
    const end = Date.now() + 60_000;
    let output = "";
    while (Date.now() < end && !/passed/.test(output)) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      output = (await vitestList({ output: true }, ctx)).processes.find((p) => p.id === started.id)?.output ?? "";
    }
    expect(output).toMatch(/passed/);

    const stopped = await vitestStop({ id: started.id }, ctx);
    expect(stopped).toEqual({ success: true, stopped: [started.id] });
    expect(alive(started.pid)).toBe(false);
    const after = await vitestList({}, ctx);
    expect(after.processes.find((p) => p.id === started.id)?.status).toBe("exited");
  }, 90_000);

  it("report an unknown id", async () => {
    expect(await vitestStop({ id: "vitest-none" }, ctx)).toEqual({ success: false, stopped: [] });
  });
});
