/**
 * vite.stop procedure - Stop a running server
 */

import type { ViteStopInput, ViteStopOutput } from "../../types.js";
import { serverManager } from "../../server-manager.js";

export async function viteStop(input: ViteStopInput): Promise<ViteStopOutput> {
  const { serverId } = input;
  const success = serverManager.stop(serverId);
  return { success };
}
