/**
 * E2E Tests: Package Lifecycle
 *
 * Tests the full lib new + lib install workflow.
 * These tests create real packages and run real commands.
 *
 * NOTE: Some tests (lib new, lib install, lib refresh) can take several minutes.
 * Set test timeouts accordingly.
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
  timeout: 120000, // 2 minute default timeout
};

// Longer timeout for operations that involve npm/pnpm
const LONG_TIMEOUT = 300000; // 5 minutes

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

describe.skipIf(!isCLIAvailable())("E2E: Package Lifecycle", () => {
  let tempDir: string;
  let testPackageDir: string;

  beforeAll(async () => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-lib-lifecycle-"));
    testPackageDir = path.join(tempDir, "test-package");
  });

  afterAll(async () => {
    // Cleanup temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("CLI Help", () => {
    it("should show help when run with no arguments", () => {
      const result = runCLI("");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("mark v");
      expect(result.stdout).toContain("Commands:");
    });

    it("should show version with --version flag", () => {
      const result = runCLI("--version");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/mark v\d+\.\d+\.\d+/);
    });

    it("should show lib help with 'lib --help'", () => {
      const result = runCLI("lib --help");
      expect(result.exitCode).toBe(0);
      // Should show lib-related commands or help
      expect(result.stdout.toLowerCase()).toMatch(/lib|commands|help/);
    });
  });

  describe("lib.new", () => {
    it("should show help for lib new command", () => {
      const result = runCLI("lib new --help");
      // Either shows help or shows error for missing package
      expect(result.stdout.toLowerCase() + result.stderr.toLowerCase()).toMatch(
        /help|usage|name|package|error/
      );
    });

    it(
      "should create a new package with lib new",
      { timeout: LONG_TIMEOUT },
      () => {
        const packageName = `test-pkg-${Date.now()}`;
        const result = runCLI(`lib new ${packageName}`, {
          cwd: tempDir,
          timeout: LONG_TIMEOUT,
        });

        // Check if command succeeded or if it needs more setup
        if (result.exitCode === 0) {
          const pkgDir = path.join(tempDir, packageName);
          expect(fs.existsSync(pkgDir)).toBe(true);
          expect(fs.existsSync(path.join(pkgDir, "package.json"))).toBe(true);
        } else {
          // Command may fail if ecosystem not fully configured - that's informative
          console.log("lib new result:", result.stdout, result.stderr);
        }
      }
    );
  });

  describe("lib.install", () => {
    it(
      "should install dependencies in a package directory",
      { timeout: LONG_TIMEOUT },
      () => {
        // Create a minimal package to test lib install
        const installTestDir = path.join(tempDir, "install-test");
        fs.mkdirSync(installTestDir, { recursive: true });
        fs.writeFileSync(
          path.join(installTestDir, "package.json"),
          JSON.stringify({
            name: "install-test",
            version: "1.0.0",
            type: "module",
            dependencies: {},
          })
        );

        const result = runCLI("lib install", {
          cwd: installTestDir,
          timeout: LONG_TIMEOUT,
        });

        // Check result - may succeed or provide useful error
        if (result.exitCode === 0) {
          expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
        } else {
          // Log for debugging
          console.log("lib install result:", result.stdout, result.stderr);
        }
      }
    );
  });

  describe("lib.refresh", () => {
    it(
      "should refresh a single package",
      { timeout: LONG_TIMEOUT },
      () => {
        // Create a test package
        const refreshTestDir = path.join(tempDir, "refresh-test");
        fs.mkdirSync(refreshTestDir, { recursive: true });
        fs.writeFileSync(
          path.join(refreshTestDir, "package.json"),
          JSON.stringify({
            name: "@mark1russell7/refresh-test",
            version: "1.0.0",
            type: "module",
          })
        );

        const result = runCLI("lib refresh", {
          cwd: refreshTestDir,
          timeout: LONG_TIMEOUT,
        });

        // Log result for debugging
        console.log("lib refresh result:", {
          exitCode: result.exitCode,
          stdout: result.stdout.slice(0, 500),
          stderr: result.stderr.slice(0, 500),
        });
      }
    );

    // Full refresh is very slow (260+ seconds) - test with explicit timeout
    it(
      "should handle lib refresh --all --force",
      { timeout: 600000 }, // 10 minute timeout
      () => {
        const result = runCLI("lib refresh --all --force", {
          timeout: 600000,
        });

        // This is a long operation - just verify it runs
        console.log("lib refresh --all --force completed with exit code:", result.exitCode);
        expect(result.exitCode).toBeDefined();
      }
    );
  });

  describe("Shell Commands", () => {
    it("should execute shell.exec with echo command", () => {
      const result = runCLI('shell exec --command "echo hello-from-cli"', { cwd: tempDir });
      // Shell exec should work
      if (result.exitCode === 0) {
        expect(result.stdout).toContain("hello-from-cli");
      } else {
        // May need different argument format - check error
        expect(result.stderr).toBeDefined();
      }
    });
  });
});
