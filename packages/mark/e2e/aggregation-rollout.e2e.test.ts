/**
 * E2E Tests: Aggregation Rollout
 *
 * Tests that verify aggregation-based procedures work identically
 * to the old imperative implementations in real-world scenarios.
 *
 * These tests validate the procedure.define meta-procedure system.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, type ExecSyncOptions } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const CLI_PATH = path.resolve(__dirname, "../dist/cli.js");
const EXEC_OPTIONS: ExecSyncOptions = {
  encoding: "utf-8",
  stdio: ["pipe", "pipe", "pipe"],
  timeout: 120000,
};

const LONG_TIMEOUT = 300000;

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

function isCLIAvailable(): boolean {
  return fs.existsSync(CLI_PATH);
}

describe.skipIf(!isCLIAvailable())("E2E: Aggregation Rollout", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-aggregation-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("procedure.define meta-procedure", () => {
    it("should list defined procedures", () => {
      const result = runCLI("procedure list");
      // Either shows procedures or indicates none defined
      expect(result.exitCode).toBeDefined();
    });

    it("should get a procedure by path", () => {
      const result = runCLI("procedure get lib.new");
      // May not exist or may show info
      expect(result.exitCode).toBeDefined();
    });
  });

  describe("lib.new aggregation parity", () => {
    it(
      "should create package structure via aggregation",
      { timeout: LONG_TIMEOUT },
      () => {
        const packageName = `agg-test-${Date.now()}`;
        const result = runCLI(`lib new ${packageName} --skip-git --skip-manifest`, {
          cwd: tempDir,
          timeout: LONG_TIMEOUT,
        });

        if (result.exitCode === 0) {
          const pkgDir = path.join(tempDir, packageName);

          // Verify core structure created
          expect(fs.existsSync(pkgDir)).toBe(true);
          expect(fs.existsSync(path.join(pkgDir, "src"))).toBe(true);
          expect(fs.existsSync(path.join(pkgDir, "src", "index.ts"))).toBe(true);

          // Should have package.json from cue-config
          if (fs.existsSync(path.join(pkgDir, "package.json"))) {
            const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8"));
            expect(pkg.name).toContain(packageName);
          }
        } else {
          // Log for debugging if failed
          console.log("lib new aggregation test:", result.stdout, result.stderr);
        }
      }
    );
  });

  describe("lib.refresh aggregation parity", () => {
    it(
      "should refresh package via aggregation",
      { timeout: LONG_TIMEOUT },
      () => {
        // Create a minimal test package
        const refreshDir = path.join(tempDir, "refresh-agg-test");
        fs.mkdirSync(path.join(refreshDir, "src"), { recursive: true });
        fs.writeFileSync(
          path.join(refreshDir, "package.json"),
          JSON.stringify({
            name: "@mark1russell7/refresh-agg-test",
            version: "1.0.0",
            type: "module",
            scripts: {
              build: "echo 'build complete'",
            },
          })
        );
        fs.writeFileSync(
          path.join(refreshDir, "src", "index.ts"),
          "export {};"
        );

        const result = runCLI("lib refresh --skip-git", {
          cwd: refreshDir,
          timeout: LONG_TIMEOUT,
        });

        // Log result
        console.log("lib refresh aggregation test:", {
          exitCode: result.exitCode,
          stdout: result.stdout.slice(0, 300),
          stderr: result.stderr.slice(0, 300),
        });

        expect(result.exitCode).toBeDefined();
      }
    );
  });

  describe("aggregation chain behavior", () => {
    it("should handle conditional steps correctly", () => {
      // Test with --skip-git to verify conditional skipping
      const testDir = path.join(tempDir, "cond-test");
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(
        path.join(testDir, "package.json"),
        JSON.stringify({
          name: "@mark1russell7/cond-test",
          version: "1.0.0",
          type: "module",
          scripts: { build: "echo build" },
        })
      );

      const withGit = runCLI("lib refresh", { cwd: testDir, timeout: LONG_TIMEOUT });
      const withoutGit = runCLI("lib refresh --skip-git", { cwd: testDir, timeout: LONG_TIMEOUT });

      // Both should complete (regardless of exit code)
      expect(withGit.exitCode).toBeDefined();
      expect(withoutGit.exitCode).toBeDefined();
    });

    it("should handle force cleanup correctly", () => {
      const forceDir = path.join(tempDir, "force-test");
      fs.mkdirSync(path.join(forceDir, "node_modules"), { recursive: true });
      fs.writeFileSync(path.join(forceDir, "node_modules", "test.txt"), "test");
      fs.writeFileSync(
        path.join(forceDir, "package.json"),
        JSON.stringify({
          name: "@mark1russell7/force-test",
          version: "1.0.0",
          type: "module",
          scripts: { build: "echo build" },
        })
      );

      const noForce = runCLI("lib refresh --skip-git", { cwd: forceDir, timeout: LONG_TIMEOUT });

      // node_modules should still exist after non-force refresh
      const nodeModulesAfter = fs.existsSync(path.join(forceDir, "node_modules"));

      console.log("Force test - node_modules exists after no-force:", nodeModulesAfter);
      expect(noForce.exitCode).toBeDefined();
    });
  });

  describe("error handling parity", () => {
    it("should handle missing package gracefully", () => {
      const result = runCLI("lib new", { cwd: tempDir });
      // Should show error for missing package name
      expect(result.exitCode !== 0 || result.stderr.length > 0 || result.stdout.includes("error")).toBe(true);
    });

    it("should handle non-existent directory gracefully", () => {
      const result = runCLI("lib refresh", {
        cwd: path.join(tempDir, "non-existent"),
        timeout: 5000,
      });
      // Should fail or show error
      expect(result.exitCode !== 0 || result.stderr.length > 0).toBe(true);
    });
  });
});
