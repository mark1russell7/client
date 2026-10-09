/**
 * vite.preview procedure - Preview production build
 */

import { spawn } from "child_process";
import { resolveViteCli } from "../../vite-cli.js";
import type { VitePreviewInput, VitePreviewOutput } from "../../types.js";
import { serverManager } from "../../server-manager.js";

export async function vitePreview(input: VitePreviewInput): Promise<VitePreviewOutput> {
  const { cwd, port } = input;

  // The project's own vite, run with Node and an argument list: no shell (deep dive WRP-8)
  const args = [resolveViteCli(cwd ?? process.cwd()), "preview"];
  if (port) args.push("--port", String(port));

  const child = spawn(process.execPath, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });

  const serverId = serverManager.register(child, "");
  const url = await serverManager.waitForReady(serverId);

  return {
    serverId,
    url,
    pid: child.pid ?? 0,
  };
}
