/**
 * vite.dev procedure - Start Vite dev server
 */

import { viteArg } from "../../vite-cli.js";
import type { ViteDevInput, ViteDevOutput } from "../../types.js";
import { serverManager } from "../../server-manager.js";

export async function viteDev(input: ViteDevInput): Promise<ViteDevOutput> {
  const { cwd, port, host, open } = input;

  // The project's own vite, run with Node and an argument list: no shell (deep dive WRP-8)
  const args: string[] = [];
  if (port) args.push("--port", String(port));
  if (host) args.push("--host", viteArg("host", host));
  if (open) args.push("--open");

  return serverManager.start(args, cwd);
}
