/**
 * vite.build procedure - Build for production
 */

import { spawn } from "child_process";
import { resolveViteCli, viteArg } from "../../vite-cli.js";
import { resolve } from "path";
import type { ViteBuildInput, ViteBuildOutput } from "../../types.js";

export async function viteBuild(input: ViteBuildInput): Promise<ViteBuildOutput> {
  const { cwd, outDir, mode } = input;

  // The project's own vite, run with Node and an argument list: no shell (deep dive WRP-8)
  const args = [resolveViteCli(cwd ?? process.cwd()), "build"];
  if (outDir) args.push("--outDir", viteArg("outDir", outDir));
  if (mode) args.push("--mode", viteArg("mode", mode));

  return new Promise((resolve_promise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });

    let stderr = "";

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve_promise({
          success: true,
          outDir: resolve(cwd, outDir ?? "dist"),
        });
      } else {
        reject(new Error(`Build failed with code ${code}: ${stderr}`));
      }
    });

    child.on("error", reject);
  });
}
