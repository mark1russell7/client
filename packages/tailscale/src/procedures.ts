/**
 * The procedure of `@procedures/tailscale`: `tailscale.run`, one procedure for each tailscale
 * command (`status`, `ip`, `serve`, `up`, `down`).
 *
 * The program comes from the host, never from the input (audit pass 2, O55): the `executable`
 * option of `createTailscaleModule()`, then `TAILSCALE_EXE`, then the install folder, then
 * `tailscale`. Before, an input `executable` let the caller start any program.
 *
 * The procedure starts tailscale with argv through a nested `shell.run` call, the runner of
 * `defineCliTool()` (tracker item O64). The engine applies its rules to that call, and a cancel
 * stops the program.
 */

import { existsSync } from "node:fs";
import { createProcedure, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { defineCliTool } from "@procedures/shell/cli";
import { z } from "zod";
import { buildArgv, parseJsonOutput, type ArgValue } from "./argv.js";

/** The Windows installer does not put tailscale on the PATH. */
const WINDOWS_PATH = "C:\\Program Files\\Tailscale\\tailscale.exe";

/** This function gives the tailscale program: the explicit value, TAILSCALE_EXE, the Windows install folder, then tailscale. */
export function tailscaleExecutable(explicit?: string): string {
  if (explicit !== undefined) return explicit;
  const fromEnv = process.env["TAILSCALE_EXE"];
  if (fromEnv) return fromEnv;
  return process.platform === "win32" && existsSync(WINDOWS_PATH) ? WINDOWS_PATH : "tailscale";
}

const RunInputSchema = z.object({
  path: z
    .array(z.string().regex(/^[a-z][a-z-]*$/))
    .min(1)
    .describe('The tailscale command, for example ["status"], ["ip"] or ["serve", "status"]'),
  positional: z.array(z.string()).optional().describe("The positional arguments"),
  args: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    .optional()
    .describe('The flags, for example { bg: true }'),
  json: z.boolean().default(false).describe("Ask for JSON output (--json) and read it. Only some commands have it (status, serve status)."),
  // The program comes from the host (audit pass 2, O55): an input that names one is refused
  executable: z
    .never({ error: "tailscale.run takes its program from the host: give executable to createTailscaleModule(), or set TAILSCALE_EXE" })
    .optional(),
  timeout: z.number().int().positive().default(60_000).describe("The time limit, in milliseconds (default: 60000)"),
});
type RunInput = z.infer<typeof RunInputSchema>;

interface RunOutput {
  exitCode: number;
  success: boolean;
  stdout: string;
  stderr: string;
  json?: unknown;
  /** The login or enable address that tailscale printed, when it printed one */
  actionUrl?: string | undefined;
}
const RunOutputSchema = z.object({
  exitCode: z.number(),
  success: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  json: z.unknown().optional(),
  actionUrl: z.string().optional(),
});

/**
 * True when the output of `shell.run` tells that the program did not start. `shell.run` gives
 * exit code 1 and the error of the start as the standard error, for example `spawn tailscale ENOENT`.
 */
function didNotStart(result: { exitCode: number; stdout: string; stderr: string }): boolean {
  return result.exitCode === 1 && result.stdout === "" && /^spawn .+ E[A-Z0-9]+$/.test(result.stderr);
}

/** The settings of the host for the procedures of this package. The procedure input cannot change them. */
export interface TailscaleProceduresOptions {
  /** The tailscale program. The default is `TAILSCALE_EXE`, then the Windows install folder, then `tailscale`. */
  readonly executable?: string | undefined;
}

/**
 * This function gives the procedures of this package with the settings of the host. The program
 * of `tailscale.run` is `executable`, or the default of `tailscaleExecutable()` at each call.
 */
export function createTailscaleProcedures(options: TailscaleProceduresOptions = {}): AnyProcedure[] {
  const tailscale = defineCliTool({ name: "tailscale", resolve: () => tailscaleExecutable(options.executable) });
  const run = createProcedure()
    .path(["tailscale", "run"])
    .input(RunInputSchema)
    .output(RunOutputSchema)
    .meta({
      description: "Run a tailscale command (status, ip, serve, up, down)",
      args: ["path"],
      shorts: { timeout: "t" },
      output: "json",
      calls: ["shell.run"],
      // up, down and serve change the network of the host. ssh starts a program on another host.
      effects: { reads: ["network"], writes: ["network", "process"], destructive: true },
    })
    .handler(async (input: RunInput, ctx: ProcedureContext): Promise<RunOutput> => {
      const argv = buildArgv({
        path: input.path,
        flags: input.json ? ["--json"] : [],
        args: input.args as Record<string, ArgValue> | undefined,
        positional: input.positional,
      });
      const result = await tailscale.call(argv, { timeout: input.timeout }, ctx);
      if (didNotStart(result)) throw new Error(`tailscale did not start: ${result.stderr}`);
      const json = input.json ? parseJsonOutput(result.stdout) : undefined;
      // tailscale prints an address to open when a login or a feature needs the owner
      const actionUrl = /https:\/\/login\.tailscale\.com\/\S+/.exec(`${result.stdout}\n${result.stderr}`)?.[0];
      return {
        exitCode: result.exitCode,
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        ...(json !== undefined ? { json } : {}),
        ...(actionUrl !== undefined ? { actionUrl } : {}),
      };
    })
    .build();
  return [run];
}

export const tailscaleProcedures: AnyProcedure[] = createTailscaleProcedures();

export const tailscaleRunProcedure: AnyProcedure = tailscaleProcedures[0]!;
