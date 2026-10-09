/**
 * vite.dev procedure - Start Vite dev server
 */

import { spawn } from "child_process";
import { resolveViteCli, viteArg } from "../../vite-cli.js";
import type { ViteDevInput, ViteDevOutput } from "../../types.js";
import { serverManager } from "../../server-manager.js";

export async function viteDev(input: ViteDevInput): Promise<ViteDevOutput> {
  const { cwd, port, host, open } = input;

  // The project's own vite, run with Node and an argument list: no shell (deep dive WRP-8)
  const args = [resolveViteCli(cwd ?? process.cwd())];
  if (port) args.push("--port", String(port));
  if (host) args.push("--host", viteArg("host", host));
  if (open) args.push("--open");

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
