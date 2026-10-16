/**
 * The procedure of `@procedures/tailscale`: `tailscale.run`, one procedure for each tailscale
 * command (`status`, `ip`, `serve`, `up`, `down`).
 */

import { existsSync } from "node:fs";
import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { runCommand } from "@procedures/shell/command";
import { z } from "zod";
import { buildArgv, parseJsonOutput, type ArgValue } from "./argv.js";

/** The Windows installer does not put tailscale on the PATH. */
const WINDOWS_PATH = "C:\\Program Files\\Tailscale\\tailscale.exe";

/** This function gives the tailscale program: the input, TAILSCALE_EXE, the Windows install folder, then tailscale. */
export function tailscaleExecutable(explicit?: string): string {
  if (explicit !== undefined) return explicit;
  const fromEnv = process.env["TAILSCALE_EXE"];
  if (fromEnv) return fromEnv;
  return process.platform === "win32" && existsSync(WINDOWS_PATH) ? WINDOWS_PATH : "tailscale";
}

const RunInput = z.object({
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
  executable: z.string().min(1).optional().describe("The tailscale program (default: TAILSCALE_EXE, then the install folder, then tailscale)"),
  timeout: z.number().int().positive().default(60_000).describe("The time limit, in milliseconds (default: 60000)"),
});
type RunInput = z.infer<typeof RunInput>;

interface RunOutput {
  exitCode: number;
  success: boolean;
  stdout: string;
  stderr: string;
  json?: unknown;
  /** The login or enable address that tailscale printed, when it printed one */
  actionUrl?: string;
}
const RunOutput = z.object({
  exitCode: z.number(),
  success: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  json: z.unknown().optional(),
  actionUrl: z.string().optional(),
});

export const tailscaleRunProcedure: AnyProcedure = createProcedure()
  .path(["tailscale", "run"])
  .input(zodAdapter<RunInput>(RunInput))
  .output(zodAdapter<RunOutput>(RunOutput))
  .meta({
    description: "Run a tailscale command (status, ip, serve, up, down)",
    args: ["path"],
    shorts: { timeout: "t" },
    output: "json",
    // up, down and serve change the network of the host. ssh starts a program on another host.
    effects: { reads: ["network"], writes: ["network", "process"], destructive: true },
  })
  .handler(async (input: RunInput, ctx?: ProcedureContext): Promise<RunOutput> => {
    const argv = buildArgv({
      path: input.path,
      flags: input.json ? ["--json"] : [],
      args: input.args as Record<string, ArgValue> | undefined,
      positional: input.positional,
    });
    const result = await runCommand(tailscaleExecutable(input.executable), { args: argv, timeout: input.timeout, signal: ctx?.signal });
    if (result.error) throw new Error(`tailscale did not start: ${result.error}`);
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
  .build() as AnyProcedure;

export const tailscaleProcedures: AnyProcedure[] = [tailscaleRunProcedure];
