/**
 * The front door `run()` of mark: the global flags of the modes and hosts before a mode starts.
 * The options of `--server` without `--server` are an error, `--events` checks its patterns, and
 * `--fs-root` goes to each host (roadmap R33). No test starts a server.
 */

import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./cli.js";

let base: string;
let root: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "mark-run-"));
  root = join(base, "root");
  mkdirSync(root);
  writeFileSync(join(root, "inside.txt"), "inside");
  writeFileSync(join(base, "outside.txt"), "outside");
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

afterEach(() => {
  process.exitCode = 0;
  vi.restoreAllMocks();
});

/** The exit code and the printed lines of a run. */
async function runOf(argv: string[]): Promise<{ exitCode: number; output: string }> {
  process.exitCode = 0;
  const lines: string[] = [];
  const keep = (...args: unknown[]): void => {
    lines.push(args.map(String).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(keep);
  vi.spyOn(console, "error").mockImplementation(keep);
  vi.spyOn(console, "warn").mockImplementation(keep);
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  await run(argv);
  return { exitCode: Number(process.exitCode ?? 0), output: lines.join("\n") };
}

describe("run: the options of the modes", () => {
  it("refuses an option of --server without --server, also before serve and mcp", async () => {
    for (const argv of [["--port", "4000", "serve"], ["--events", "orders.*", "mcp"], ["--host", "::1", "fs", "read", "x"], ["--transport", "both", "-i"], ["--probe-port", "9090", "serve"]]) {
      const { exitCode, output } = await runOf(argv);
      expect(exitCode, argv.join(" ")).toBe(1);
      expect(output).toContain("are options of --server");
    }
  });

  it("checks the --events patterns of --server before the server starts", async () => {
    await expect(runOf(["--server", "--events", "orders.*.created"])).rejects.toThrow('Invalid topic pattern: "orders.*.created"');
    await expect(runOf(["--server", "--port", "0x10"])).rejects.toThrow("Invalid port");
    await expect(runOf(["--server", "--transport", "udp"])).rejects.toThrow("Invalid transport");
    await expect(runOf(["--server", "--probe-port", "probes"])).rejects.toThrow("Invalid port");
  });

  it("refuses a command after --server or -i, and an unknown leading flag", async () => {
    expect((await runOf(["--server", "fs", "read"])).output).toContain("--server takes no command");
    expect((await runOf(["-i", "fs", "read"])).output).toContain("-i takes no command");
    const unknown = await runOf(["--bogus", "fs", "read"]);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.output).toContain("Unknown option before the command: --bogus");
  });

  it("shows the help of mark mcp with --fs-root, and refuses an unknown option of mark mcp", async () => {
    const help = await runOf(["--fs-root", root, "mcp", "--help"]);
    expect(help.output).toContain("--fs-root <folder>");
    expect(help.output).toContain("serves no remote events");
    await expect(runOf(["mcp", "--bogus"])).rejects.toThrow("Unknown option of mark mcp: --bogus");
  }, 60000);

  it("shows --max-sessions in the help of mark mcp, and refuses a value that is not a limit (CLI-51)", async () => {
    const help = await runOf(["mcp", "--help"]);
    expect(help.output).toContain("--max-sessions <n>");
    for (const value of ["0", "-1", "2.5", "many", ""]) {
      await expect(runOf(["mcp", "--http", "0", `--max-sessions=${value}`]), value).rejects.toThrow("--max-sessions needs an integer of 1 or more, or Infinity");
    }
  }, 60000);
});

describe("run: --fs-root", () => {
  it("confines a command of this process to the root", async () => {
    const inside = await runOf(["--fs-root", root, "--local", "--format", "json", "fs", "read", "inside.txt"]);
    expect(inside.exitCode).toBe(0);
    expect(inside.output).toContain('"content": "inside"');
    const outside = await runOf(["--fs-root", root, "--local", "fs", "read", join(base, "outside.txt")]);
    expect(outside.exitCode).toBe(1);
    expect(outside.output).toContain("outside the root");
  }, 120000);
});
