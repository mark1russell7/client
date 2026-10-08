import { describe, it, expect } from "vitest";
import { shellRun } from "./run.js";

// Run small node scripts as the command: portable, and no shell is involved
function node(script: string, extra: { timeout?: number } = {}) {
  return shellRun({ command: process.execPath, args: ["-e", script], encoding: "utf8", ...extra });
}

describe("shell.run", () => {
  it("returns stdout, stderr and the exit code", async () => {
    const result = await node("process.stdout.write('out'); process.stderr.write('err'); process.exit(3)");

    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("err");
    expect(result.exitCode).toBe(3);
    expect(result.success).toBe(false);
  });

  it("passes arguments without a shell", async () => {
    const result = await shellRun({
      command: process.execPath,
      args: ["-e", "process.stdout.write(process.argv[1])", "$(echo injected) & ; |"],
      encoding: "utf8",
    });

    expect(result.stdout).toBe("$(echo injected) & ; |");
  });

  it("keeps a multi-byte character that is split across two chunks (regression: BUGS-2026-07 L4)", async () => {
    // "€" is 3 bytes in UTF-8: write the first byte, wait, then write the other two
    const result = await node(
      "const b = Buffer.from('€'); process.stdout.write(b.subarray(0, 1)); setTimeout(() => process.stdout.write(b.subarray(1)), 50)"
    );

    expect(result.stdout).toBe("€");
  });

  it("reports the signal when the timeout kills the process (regression: BUGS-2026-07 L4)", async () => {
    const result = await node("setTimeout(() => {}, 10000)", { timeout: 200 });

    expect(result.success).toBe(false);
    expect(result.signal).toBe("SIGTERM");
  });

  it("reports a command that cannot start", async () => {
    const result = await shellRun({ command: "no-such-command-xyz", args: [], encoding: "utf8" });

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });
});
