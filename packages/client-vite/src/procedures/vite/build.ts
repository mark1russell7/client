/**
 * vite.build procedure - Build for production
 */

import { resolve } from "node:path";
import { runCommand } from "@mark1russell7/client-shell/command";
import { resolveViteCli, viteArg } from "../../vite-cli.js";
import type { ViteBuildInput, ViteBuildOutput } from "../../types.js";

export async function viteBuild(
  input: ViteBuildInput,
  ctx?: { signal?: AbortSignal | undefined }
): Promise<ViteBuildOutput> {
  const { outDir, mode } = input;
  // Without cwd, the build runs in the current folder. (Before, `resolve(undefined, ...)` threw.)
  const cwd = input.cwd ?? process.cwd();

  // The project's own vite, run with Node and an argument list: no shell (deep dive WRP-8)
  const args = [resolveViteCli(cwd), "build"];
  if (outDir) args.push("--outDir", viteArg("outDir", outDir));
  if (mode) args.push("--mode", viteArg("mode", mode));

  // The signal kills vite and the processes that it started (roadmap 2.2)
  const result = await runCommand(process.execPath, {
    args,
    cwd,
    env: { NO_COLOR: "1" },
    signal: ctx?.signal,
    keep: "tail",
    maxOutputBytes: 1024 * 1024,
  });
  if (result.aborted) {
    const error = new Error("vite.build was aborted");
    error.name = "AbortError";
    throw error;
  }
  if (!result.success) {
    throw new Error(`Build failed with code ${result.exitCode}: ${result.error ?? result.stderr}`);
  }
  return {
    success: true,
    outDir: resolve(cwd, outDir ?? "dist"),
  };
}
