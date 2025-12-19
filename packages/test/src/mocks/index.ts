/**
 * Mock utilities for testing procedures
 * 
 * Provides mock factories for Client, ProcedureContext, and other core types.
 */

import type { Mock } from "vitest";

/**
 * Mock ProcedureContext for unit testing procedures
 */
export interface MockProcedureContext {
  cwd: string;
  log: {
    info: Mock;
    warn: Mock;
    error: Mock;
    debug: Mock;
  };
  client: {
    call: Mock;
    exec: Mock;
  };
}

/**
 * Create a mock ProcedureContext
 */
export function createMockContext(
  options: { cwd?: string } = {}
): MockProcedureContext {
  // Dynamic import of vitest to get mock function
  const { vi } = require("vitest");
  
  return {
    cwd: options.cwd ?? process.cwd(),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    client: {
      call: vi.fn(),
      exec: vi.fn(),
    },
  };
}

/**
 * Mock child_process exec for testing shell commands
 */
export interface MockExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function createMockExec(results: Map<string, MockExecResult>): Mock {
  const { vi } = require("vitest");
  
  return vi.fn().mockImplementation((cmd: string) => {
    const result = results.get(cmd);
    if (!result) {
      throw new Error(`No mock result for command: ${cmd}`);
    }
    if (result.exitCode !== 0) {
      const error = new Error(`Command failed: ${cmd}`);
      (error as Error & { stdout: string; stderr: string }).stdout = result.stdout;
      (error as Error & { stdout: string; stderr: string }).stderr = result.stderr;
      throw error;
    }
    return { stdout: result.stdout, stderr: result.stderr };
  });
}

/**
 * Mock filesystem operations
 */
export interface MockFs {
  files: Map<string, string>;
  dirs: Set<string>;
  readFile: Mock;
  writeFile: Mock;
  mkdir: Mock;
  readdir: Mock;
  stat: Mock;
  exists: Mock;
}

export function createMockFs(
  initialFiles: Record<string, string> = {},
  initialDirs: string[] = []
): MockFs {
  const { vi } = require("vitest");
  
  const files = new Map(Object.entries(initialFiles));
  const dirs = new Set(initialDirs);

  return {
    files,
    dirs,
    readFile: vi.fn().mockImplementation((path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file: ${path}`);
      }
      return content;
    }),
    writeFile: vi.fn().mockImplementation((path: string, content: string) => {
      files.set(path, content);
    }),
    mkdir: vi.fn().mockImplementation((path: string) => {
      dirs.add(path);
    }),
    readdir: vi.fn().mockImplementation((path: string) => {
      const entries: string[] = [];
      for (const file of files.keys()) {
        if (file.startsWith(path + "/")) {
          const rest = file.slice(path.length + 1);
          const name = rest.split("/")[0];
          if (name && !entries.includes(name)) {
            entries.push(name);
          }
        }
      }
      return entries;
    }),
    stat: vi.fn().mockImplementation((path: string) => {
      if (dirs.has(path)) {
        return { isDirectory: () => true, isFile: () => false };
      }
      if (files.has(path)) {
        return { isDirectory: () => false, isFile: () => true };
      }
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    }),
    exists: vi.fn().mockImplementation((path: string) => {
      return files.has(path) || dirs.has(path);
    }),
  };
}
