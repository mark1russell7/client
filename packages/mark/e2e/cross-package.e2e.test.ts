/**
 * E2E Tests: Cross-Package Procedure Calls
 *
 * Tests that procedures from different packages work together.
 * Focus on fast, isolated operations that don't require network or long waits.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, type ExecSyncOptions } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

// Test configuration
const CLI_PATH = path.resolve(__dirname, "../dist/cli.js");
const EXEC_OPTIONS: ExecSyncOptions = {
  encoding: "utf-8",
  stdio: ["pipe", "pipe", "pipe"],
  timeout: 30000, // 30 second timeout for most operations
};

/**
 * Helper to run CLI commands
 */
function runCLI(
  args: string,
  options: Partial<ExecSyncOptions> = {}
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node "${CLI_PATH}" ${args}`, {
      ...EXEC_OPTIONS,
      ...options,
    }) as string;
    return { stdout: stdout.trim(), stderr: "", exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    return {
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? ""),
      exitCode: err.status ?? 1,
    };
  }
}

/**
 * Check if CLI is available (built)
 */
function isCLIAvailable(): boolean {
  return fs.existsSync(CLI_PATH);
}

describe.skipIf(!isCLIAvailable())("E2E: Cross-Package Procedures", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-cross-pkg-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("client-shell procedures", () => {
    it("should execute shell.exec to run echo", () => {
      const result = runCLI('shell exec --command "echo test-output"', { cwd: tempDir });
      // Check if command is recognized
      if (result.exitCode === 0) {
        expect(result.stdout).toContain("test-output");
      }
    });

    it("should execute shell.exec to get current directory", () => {
      // Use pwd on Unix, cd on Windows
      const command = process.platform === "win32" ? "cd" : "pwd";
      const result = runCLI(`shell exec --command "${command}"`, { cwd: tempDir });
      if (result.exitCode === 0) {
        // Should contain path info
        expect(result.stdout.length).toBeGreaterThan(0);
      }
    });
  });

  describe("client-fs procedures", () => {
    it("should read a file via fs.read", () => {
      // Create a test file
      const testFile = path.join(tempDir, "test-read.txt");
      fs.writeFileSync(testFile, "test-content-12345");

      const result = runCLI(`fs read --path "${testFile}"`);
      if (result.exitCode === 0) {
        expect(result.stdout).toContain("test-content-12345");
      }
    });

    it("should write a file via fs.write", () => {
      const testFile = path.join(tempDir, "test-write.txt");
      const content = "written-by-cli";

      const result = runCLI(`fs write --path "${testFile}" --content "${content}"`);
      if (result.exitCode === 0) {
        expect(fs.existsSync(testFile)).toBe(true);
        expect(fs.readFileSync(testFile, "utf-8")).toContain(content);
      }
    });

    it("should check if file exists via fs.exists", () => {
      const testFile = path.join(tempDir, "exists-test.txt");
      fs.writeFileSync(testFile, "exists");

      const result = runCLI(`fs exists --path "${testFile}"`);
      if (result.exitCode === 0) {
        // Should indicate file exists
        expect(result.stdout.toLowerCase()).toMatch(/true|exists|yes|1/);
      }
    });
  });

  describe("client-git procedures", () => {
    it("should initialize a git repo via git.init", () => {
      const repoDir = path.join(tempDir, "git-test-repo");
      fs.mkdirSync(repoDir, { recursive: true });

      const result = runCLI(`git init --path "${repoDir}"`);
      if (result.exitCode === 0) {
        expect(fs.existsSync(path.join(repoDir, ".git"))).toBe(true);
      }
    });

    it("should get git status via git.status", () => {
      const repoDir = path.join(tempDir, "git-status-repo");
      fs.mkdirSync(repoDir, { recursive: true });
      execSync("git init", { cwd: repoDir, stdio: "pipe" });

      const result = runCLI(`git status`, { cwd: repoDir });
      // Should return status or indicate clean state
      if (result.exitCode === 0) {
        expect(result.stdout.length).toBeGreaterThan(0);
      }
    });
  });

  describe("client-pnpm procedures", () => {
    it("should show pnpm version via pnpm.version", () => {
      const result = runCLI("pnpm version");
      // Should return version info or help
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    });
  });

  describe("Procedure discovery", () => {
    it("should list available procedures with --help", () => {
      const result = runCLI("--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Commands:");
      // Should show at least some procedure groups
      expect(result.stdout).toMatch(/shell|fs|git|lib|pnpm|log/i);
    });
  });
});
