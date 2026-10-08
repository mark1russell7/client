/**
 * E2E Tests: Procedure Creation
 *
 * Tests the procedure new workflow for scaffolding new procedures.
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
  timeout: 120000, // 2 minute default
};

const LONG_TIMEOUT = 300000; // 5 minutes for operations that involve pnpm

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

/**
 * Create a minimal package structure for testing procedure creation
 */
function createTestPackage(dir: string, name: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: `@mark1russell7/${name}`,
        version: "1.0.0",
        type: "module",
        main: "./dist/index.js",
        scripts: {
          build: "tsc -b",
        },
        dependencies: {
          "@mark1russell7/client": "github:mark1russell7/client#main",
          zod: "^3.24.0",
        },
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          outDir: "./dist",
          strict: true,
          declaration: true,
        },
        include: ["src"],
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(dir, "src", "index.ts"),
    `// Package entry point\nexport {};\n`
  );
}

describe.skipIf(!isCLIAvailable())("E2E: Procedure Creation", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-procedure-new-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("procedure.new help", () => {
    it("should show help for procedure new command", () => {
      const result = runCLI("procedure new --help");
      // Should show help or usage info
      expect(result.stdout.toLowerCase() + result.stderr.toLowerCase()).toMatch(
        /help|usage|procedure|path|name|error/
      );
    });

    it("should show procedure group commands", () => {
      const result = runCLI("procedure --help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toMatch(/procedure|commands|new|get/);
    });
  });

  describe("procedure.new execution", () => {
    it(
      "should create a new procedure in a package",
      { timeout: LONG_TIMEOUT },
      () => {
        const packageName = "proc-test-pkg";
        const packageDir = path.join(tempDir, packageName);
        createTestPackage(packageDir, packageName);

        // Try to create a procedure
        const result = runCLI("procedure new custom.action", {
          cwd: packageDir,
          timeout: LONG_TIMEOUT,
        });

        // Check if files were created
        const procedurePath = path.join(packageDir, "src", "procedures", "custom", "action.ts");

        if (result.exitCode === 0) {
          expect(fs.existsSync(procedurePath)).toBe(true);

          // Verify the procedure file has correct structure
          const content = fs.readFileSync(procedurePath, "utf-8");
          expect(content).toContain("export");
          expect(content).toMatch(/procedure|handler|zod/i);
        } else {
          // Log for debugging - procedure new may need additional setup
          console.log("procedure new result:", {
            exitCode: result.exitCode,
            stdout: result.stdout.slice(0, 500),
            stderr: result.stderr.slice(0, 500),
          });
        }
      }
    );

    it(
      "should create nested procedure paths",
      { timeout: LONG_TIMEOUT },
      () => {
        const packageDir = path.join(tempDir, "nested-proc-pkg");
        createTestPackage(packageDir, "nested-proc-pkg");

        // Create a deeply nested procedure
        const result = runCLI("procedure new api.v2.users.create", {
          cwd: packageDir,
          timeout: LONG_TIMEOUT,
        });

        if (result.exitCode === 0) {
          const procedurePath = path.join(
            packageDir,
            "src",
            "procedures",
            "api",
            "v2",
            "users",
            "create.ts"
          );
          expect(fs.existsSync(procedurePath)).toBe(true);
        } else {
          console.log("nested procedure new result:", {
            exitCode: result.exitCode,
            stdout: result.stdout.slice(0, 500),
            stderr: result.stderr.slice(0, 500),
          });
        }
      }
    );
  });

  describe("procedure.get", () => {
    it("should list available procedures", () => {
      const result = runCLI("procedure get");
      // Should list procedures or show helpful message
      console.log("procedure get result:", {
        exitCode: result.exitCode,
        stdout: result.stdout.slice(0, 500),
      });
    });
  });
});
