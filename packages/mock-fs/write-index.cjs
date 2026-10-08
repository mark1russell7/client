const fs = require('fs');
const path = require('path');
const content = `/**
 * @mark1russell7/mock-fs
 *
 * In-memory filesystem mock for unit testing.
 */

export interface MockFsEntry {
  type: "file" | "directory";
  content?: string | undefined;
  mtime: Date;
}

export interface MockFs {
  files: Map<string, MockFsEntry>;
  
  // File operations
  readFile(path: string): string;
  readFileSync(path: string): string;
  writeFile(path: string, content: string): void;
  writeFileSync(path: string, content: string): void;
  exists(path: string): boolean;
  existsSync(path: string): boolean;
  unlink(path: string): void;
  unlinkSync(path: string): void;
  
  // Directory operations
  mkdir(path: string, options?: { recursive?: boolean }): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readdir(path: string): string[];
  readdirSync(path: string): string[];
  rmdir(path: string, options?: { recursive?: boolean }): void;
  rmdirSync(path: string, options?: { recursive?: boolean }): void;
  
  // Stats
  stat(path: string): { isFile(): boolean; isDirectory(): boolean; mtime: Date };
  statSync(path: string): { isFile(): boolean; isDirectory(): boolean; mtime: Date };
  
  // Utilities
  reset(): void;
  getAll(): Map<string, MockFsEntry>;
}

export interface CreateMockFsOptions {
  initialFiles?: Record<string, string> | undefined;
  initialDirs?: string[] | undefined;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/g, "");
}

function dirname(p: string): string {
  const parts = p.split("/");
  parts.pop();
  return parts.join("/") || "/";
}

export function createMockFs(options: CreateMockFsOptions = {}): MockFs {
  const files = new Map<string, MockFsEntry>();
  
  // Initialize with provided files
  if (options.initialDirs) {
    for (const dir of options.initialDirs) {
      files.set(normalizePath(dir), { type: "directory", mtime: new Date() });
    }
  }
  if (options.initialFiles) {
    for (const [path, content] of Object.entries(options.initialFiles)) {
      files.set(normalizePath(path), { type: "file", content, mtime: new Date() });
    }
  }

  const ensureParentDirs = (path: string): void => {
    const parts = normalizePath(path).split("/").slice(0, -1);
    let current = "";
    for (const part of parts) {
      current = current ? current + "/" + part : part;
      if (current && !files.has(current)) {
        files.set(current, { type: "directory", mtime: new Date() });
      }
    }
  };

  const mockFs: MockFs = {
    files,

    readFile(p: string): string {
      const entry = files.get(normalizePath(p));
      if (!entry || entry.type !== "file") {
        throw new Error("ENOENT: no such file: " + p);
      }
      return entry.content ?? "";
    },
    readFileSync(p: string): string { return this.readFile(p); },

    writeFile(p: string, content: string): void {
      const np = normalizePath(p);
      ensureParentDirs(np);
      files.set(np, { type: "file", content, mtime: new Date() });
    },
    writeFileSync(p: string, content: string): void { this.writeFile(p, content); },

    exists(p: string): boolean { return files.has(normalizePath(p)); },
    existsSync(p: string): boolean { return this.exists(p); },

    unlink(p: string): void {
      const np = normalizePath(p);
      if (!files.has(np)) throw new Error("ENOENT: " + p);
      files.delete(np);
    },
    unlinkSync(p: string): void { this.unlink(p); },

    mkdir(p: string, options?: { recursive?: boolean }): void {
      const np = normalizePath(p);
      if (options?.recursive) {
        ensureParentDirs(np + "/dummy");
      }
      files.set(np, { type: "directory", mtime: new Date() });
    },
    mkdirSync(p: string, options?: { recursive?: boolean }): void { this.mkdir(p, options); },

    readdir(p: string): string[] {
      const np = normalizePath(p);
      const prefix = np === "" ? "" : np + "/";
      const entries: Set<string> = new Set();
      for (const key of files.keys()) {
        if (key.startsWith(prefix) && key !== np) {
          const rest = key.slice(prefix.length);
          const name = rest.split("/")[0];
          if (name) entries.add(name);
        }
      }
      return [...entries];
    },
    readdirSync(p: string): string[] { return this.readdir(p); },

    rmdir(p: string, options?: { recursive?: boolean }): void {
      const np = normalizePath(p);
      if (options?.recursive) {
        for (const key of files.keys()) {
          if (key === np || key.startsWith(np + "/")) {
            files.delete(key);
          }
        }
      } else {
        files.delete(np);
      }
    },
    rmdirSync(p: string, options?: { recursive?: boolean }): void { this.rmdir(p, options); },

    stat(p: string): { isFile(): boolean; isDirectory(): boolean; mtime: Date } {
      const entry = files.get(normalizePath(p));
      if (!entry) throw new Error("ENOENT: " + p);
      return {
        isFile: () => entry.type === "file",
        isDirectory: () => entry.type === "directory",
        mtime: entry.mtime,
      };
    },
    statSync(p: string) { return this.stat(p); },

    reset(): void { files.clear(); },
    getAll(): Map<string, MockFsEntry> { return new Map(files); },
  };

  return mockFs;
}
`;
fs.writeFileSync(path.join(__dirname, 'src/index.ts'), content);
console.log('Written mock-fs');
