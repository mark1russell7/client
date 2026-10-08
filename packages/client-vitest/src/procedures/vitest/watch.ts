import { spawn } from "node:child_process";
import type { VitestWatchInput, VitestWatchOutput } from "../../types.js";
import { resolveVitestCli } from "../../vitest-cli.js";

export async function vitestWatch(
  input: VitestWatchInput,
  _ctx: { metadata: Record<string, unknown> }
): Promise<VitestWatchOutput> {
  const cwd = input.cwd ?? process.cwd();
  const args = [resolveVitestCli(cwd), "watch"];

  for (const pattern of input.include ?? []) {
    if (pattern.startsWith("-")) {
      throw new Error(`Invalid test pattern (starts with "-"): ${pattern}`);
    }
    args.push(pattern);
  }

  // No shell: test patterns cannot inject commands
  const proc = spawn(process.execPath, args, {
    cwd,
    shell: false,
    detached: true,
    stdio: "ignore",
  });

  proc.unref();

  return {
    pid: proc.pid ?? 0,
    status: "started",
  };
}
