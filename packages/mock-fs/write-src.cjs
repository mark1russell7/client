const fs = require('fs');
const path = require('path');

const code = `/**
 * @mark1russell7/mock-fs
 */

export interface MockFsEntry {
  type: "file" | "directory";
  content?: string | undefined;
  mtime: Date;
}

export interface MockFs {
  files: Map<string, MockFsEntry>;
  readFile(p: string): string;
  writeFile(p: string, content: string): void;
  exists(p: string): boolean;
  unlink(p: string): void;
  mkdir(p: string, opts?: { recursive?: boolean }): void;
  readdir(p: string): string[];
  reset(): void;
}

export interface CreateMockFsOptions {
  initialFiles?: Record<string, string> | undefined;
  initialDirs?: string[] | undefined;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/g, "");
}

export function createMockFs(options: CreateMockFsOptions = {}): MockFs {
  const files = new Map<string, MockFsEntry>();
  
  if (options.initialDirs) {
    for (const dir of options.initialDirs) {
      files.set(normalizePath(dir), { type: "directory", mtime: new Date() });
    }
  }
  if (options.initialFiles) {
    for (const [fp, content] of Object.entries(options.initialFiles)) {
      files.set(normalizePath(fp), { type: "file", content, mtime: new Date() });
    }
  }

  const ensureParent = (fp: string): void => {
    const parts = normalizePath(fp).split("/").slice(0, -1);
    let cur = "";
    for (const part of parts) {
      cur = cur ? cur + "/" + part : part;
      if (cur && !files.has(cur)) files.set(cur, { type: "directory", mtime: new Date() });
    }
  };

  return {
    files,
    readFile(p: string): string {
      const e = files.get(normalizePath(p));
      if (!e || e.type !== "file") throw new Error("ENOENT: " + p);
      return e.content ?? "";
    },
    writeFile(p: string, content: string): void {
      const np = normalizePath(p);
      ensureParent(np);
      files.set(np, { type: "file", content, mtime: new Date() });
    },
    exists(p: string): boolean { return files.has(normalizePath(p)); },
    unlink(p: string): void {
      const np = normalizePath(p);
      if (!files.has(np)) throw new Error("ENOENT: " + p);
      files.delete(np);
    },
    mkdir(p: string, opts?: { recursive?: boolean }): void {
      const np = normalizePath(p);
      if (opts?.recursive) ensureParent(np + "/x");
      files.set(np, { type: "directory", mtime: new Date() });
    },
    readdir(p: string): string[] {
      const np = normalizePath(p);
      const prefix = np === "" ? "" : np + "/";
      const entries = new Set();
      for (const key of files.keys()) {
        if (key.startsWith(prefix) && key !== np) {
          const rest = key.slice(prefix.length);
          const name = rest.split("/")[0];
          if (name) entries.add(name);
        }
      }
      return [...entries];
    },
    reset(): void { files.clear(); },
  };
}
`;

fs.writeFileSync(path.join(__dirname, 'src/index.ts'), code);
console.log('Written mock-fs/src/index.ts');
