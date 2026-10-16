/**
 * pnpm.exec procedure
 *
 * Run a program of the dependencies with `pnpm exec` (roadmap R41). pnpm finds the program in
 * `node_modules/.bin`. No shell runs it: "--" ends the options of pnpm, and each argument goes
 * to the program as it is.
 */

import type { ProcedureContext } from "@procedures/client";
import { pnpmArg, runPnpm, selectionArgs } from "./shared.js";
import type { PnpmExecInput, PnpmExecOutput } from "../../types.js";

/**
 * Run a program of the dependencies with pnpm exec
 *
 * @example
 * await client.call(["pnpm", "exec"], { command: "tsc", args: ["--noEmit"], filter: ["@scope/app"] });
 */
export async function pnpmExec(input: PnpmExecInput, ctx: ProcedureContext): Promise<PnpmExecOutput> {
  const args = [...selectionArgs(input), "exec", "--", pnpmArg("command", input.command), ...(input.args ?? [])];
  return runPnpm(args, input, ctx);
}
