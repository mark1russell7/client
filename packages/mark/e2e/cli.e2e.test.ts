/**
 * E2E: help, global flags and exit codes of the built CLI.
 */

import { describe, it, expect } from "vitest";
import { built, CLI, json, mark } from "./run.js";

describe.skipIf(!built)("mark: help, flags and exit codes", () => {
  it("shows the root help", () => {
    const run = mark([]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("mark v");
    expect(run.stdout).toContain("Commands:");
  });

  it("shows the version, also through the documented dist/cli.js entry", () => {
    expect(mark(["--version"]).stdout).toContain("mark v");
    const run = mark(["--version"], { entry: CLI });
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("mark v");
  });

  it("shows the help of a group and of a command", () => {
    const group = mark(["lib", "--help"]);
    expect(group.exitCode).toBe(0);
    expect(group.stdout).toContain("mark lib new");

    // -v of docker compose down is its own flag, not --version (deep dive CLI-7)
    const command = mark(["docker", "compose", "down", "--help"]);
    expect(command.exitCode).toBe(0);
    expect(command.stdout).toContain("-v, --volumes");
  });

  it("exits with 1 for an unknown command, an unknown option and invalid input (CLI-8)", () => {
    const unknown = mark(["nosuch", "command"]);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stderr).toContain("Unknown command: mark nosuch command");

    const option = mark(["fs", "exists", "x", "--bogus"]);
    expect(option.exitCode).toBe(1);
    expect(option.stderr).toContain("Unknown option for mark fs exists: --bogus");

    const missing = mark(["fs", "exists"]);
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain("Invalid input for mark fs exists");
  });

  it("gives a string field its text (CLI-9)", () => {
    const run = mark(["--format", "json", "fs", "exists", "2024"]);
    expect(run.exitCode).toBe(0);
    expect(json<{ exists: boolean }>(run).exists).toBe(false);
  });
});
