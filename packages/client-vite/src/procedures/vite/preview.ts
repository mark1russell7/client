/**
 * vite.preview procedure - Preview production build
 */

import { spawn } from "child_process";
import type { VitePreviewInput, VitePreviewOutput } from "../../types.js";
import { serverManager } from "../../server-manager.js";

export async function vitePreview(input: VitePreviewInput): Promise<VitePreviewOutput> {
  const { cwd, port } = input;

  const args = ["vite", "preview"];
  if (port) args.push("--port", String(port));

  const child = spawn("npx", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  const serverId = serverManager.register(child, "");
  const url = await serverManager.waitForReady(serverId);

  return {
    serverId,
    url,
    pid: child.pid ?? 0,
  };
}
