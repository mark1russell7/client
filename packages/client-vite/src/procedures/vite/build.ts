/**
 * vite.build procedure - Build for production
 */

import { spawn } from "child_process";
import { resolve } from "path";
import type { ViteBuildInput, ViteBuildOutput } from "../../types.js";

export async function viteBuild(input: ViteBuildInput): Promise<ViteBuildOutput> {
  const { cwd, outDir, mode } = input;

  const args = ["vite", "build"];
  if (outDir) args.push("--outDir", outDir);
  if (mode) args.push("--mode", mode);

  return new Promise((resolve_promise, reject) => {
    const child = spawn("npx", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
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
