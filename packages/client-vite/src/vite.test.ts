/**
 * vite.build, vite.dev, vite.preview and vite.stop against a small app (fixtures/app).
 * - vite.build without `cwd` builds in the current folder (before, it threw a TypeError).
 * - The servers are records of the process registry of client-shell: vite.stop ends the whole
 *   process tree, and the servers end with the host (deep dive WRP-4, WRP-10).
 */

import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { processes } from "@mark1russell7/client-shell/command";
import { viteBuild } from "./procedures/vite/build.js";
import { viteDev } from "./procedures/vite/dev.js";
import { vitePreview } from "./procedures/vite/preview.js";
import { viteStop } from "./procedures/vite/stop.js";

const app = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "app");

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("vite.build", () => {
  it("builds into outDir", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "vite-build-"));
    const result = await viteBuild({ cwd: app, outDir });
    expect(result).toEqual({ success: true, outDir });
    expect(existsSync(join(outDir, "index.html"))).toBe(true);
  }, 60_000);

  it("builds in the current folder when cwd is not given", async () => {
    const saved = process.cwd();
    process.chdir(app);
    try {
      const result = await viteBuild({});
      expect(result).toEqual({ success: true, outDir: join(app, "dist") });
    } finally {
      process.chdir(saved);
    }
  }, 60_000);

  it("stops when the signal aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(viteBuild({ cwd: app, outDir: mkdtempSync(join(tmpdir(), "vite-build-")) }, { signal: controller.signal })).rejects.toThrow(/abort/i);
  });
});

describe("vite.dev, vite.preview and vite.stop", () => {
  it("start a dev server, answer a request, then stop the whole tree", async () => {
    const server = await viteDev({ cwd: app } as Parameters<typeof viteDev>[0]);
    expect(server.url).toMatch(/^http:\/\//);
    const response = await fetch(server.url);
    expect(response.status).toBe(200);
    expect(processes.get(server.serverId)?.status).toBe("running");

    expect(await viteStop({ serverId: server.serverId })).toEqual({ success: true });
    expect(alive(server.pid)).toBe(false);
    expect(await viteStop({ serverId: server.serverId })).toEqual({ success: false });
  }, 60_000);

  it("preview a build", async () => {
    const outDir = join(app, "dist");
    await viteBuild({ cwd: app });
    expect(existsSync(join(outDir, "index.html"))).toBe(true);
    const server = await vitePreview({ cwd: app } as Parameters<typeof vitePreview>[0]);
    expect((await fetch(server.url)).status).toBe(200);
    expect((await viteStop({ serverId: server.serverId })).success).toBe(true);
  }, 60_000);
});
