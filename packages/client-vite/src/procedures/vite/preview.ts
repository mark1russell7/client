/**
 * vite.preview procedure - Preview production build
 */

import type { VitePreviewInput, VitePreviewOutput } from "../../types.js";
import { serverManager } from "../../server-manager.js";

export async function vitePreview(input: VitePreviewInput): Promise<VitePreviewOutput> {
  const { cwd, port } = input;

  // The project's own vite, run with Node and an argument list: no shell (deep dive WRP-8)
  const args = ["preview"];
  if (port) args.push("--port", String(port));

  return serverManager.start(args, cwd);
}
