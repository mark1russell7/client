/**
 * The procedure of `@procedures/tailscale`: `tailscale.run`, one procedure for each tailscale
 * command (`status`, `ip`, `serve`, `up`, `down`).
 *
 * The program comes from the host (audit pass 2, O55): the `executable` option of
 * `createTailscaleModule()`, then `TAILSCALE_EXE`, then the install folder, then `tailscale`.
 * The input `executable` is deprecated: it still names the program in 0.28, with a deprecation
 * notice. Version 0.30.0 removes it, because it lets the caller start any program.
 */

import { existsSync } from "node:fs";
import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { runCommand } from "@procedures/shell/command";
import { z } from "zod";
import { buildArgv, parseJsonOutput, type ArgValue } from "./argv.js";

/** The codes of the deprecation notices that this process emitted. */
const emitted = new Set<string>();

/** This function emits a deprecation notice one time in each process. */
function deprecationNotice(code: string, message: string): void {
  if (emitted.has(code)) return;
  emitted.add(code);
  process.emitWarning(message, { type: "DeprecationWarning", code });
}

/** The notice of the deprecated input `executable` of `tailscale.run`. */
const EXECUTABLE_INPUT_NOTICE =
  "The input executable of tailscale.run is deprecated. @procedures/tailscale 0.30.0 refuses it. " +
  "Give the program to the host: createTailscaleModule({ executable }), or set TAILSCALE_EXE.";

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
  /**
   * The tailscale program.
   *
   * @deprecated Give `executable` to `createTailscaleModule()`, or set `TAILSCALE_EXE`. Version
   * 0.30.0 refuses this input (audit pass 2, O55), because it lets the caller start any program.
   */
  executable: z
    .string()
    .min(1)
    .optional()
    .describe("Deprecated: give executable to createTailscaleModule(), or set TAILSCALE_EXE. The tailscale program (default: TAILSCALE_EXE, then the install folder, then tailscale)"),
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

/** The settings of the host for the procedures of this package. The procedure input cannot change them. */
export interface TailscaleProceduresOptions {
  /** The tailscale program. The default is `TAILSCALE_EXE`, then the Windows install folder, then `tailscale`. */
  readonly executable?: string | undefined;
}

/**
 * This function gives the procedures of this package with the settings of the host. The program
 * of `tailscale.run` is `executable`, or the default of `tailscaleExecutable()` at each call. The
 * deprecated input `executable` wins over both, with a deprecation notice.
 */
export function createTailscaleProcedures(options: TailscaleProceduresOptions = {}): AnyProcedure[] {
  const run = createProcedure()
    .path(["tailscale", "run"])
    .input(zodAdapter<RunInput>(RunInputSchema))
    .output(zodAdapter<RunOutput>(RunOutputSchema))
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
      // The deprecated input wins over the module, as before (O55: 0.30.0 removes it)
      if (input.executable !== undefined) deprecationNotice("PROCEDURES_TAILSCALE_EXECUTABLE_INPUT", EXECUTABLE_INPUT_NOTICE);
      const result = await runCommand(tailscaleExecutable(input.executable ?? options.executable), { args: argv, timeout: input.timeout, signal: ctx?.signal });
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
  return [run];
}

export const tailscaleProcedures: AnyProcedure[] = createTailscaleProcedures();

export const tailscaleRunProcedure: AnyProcedure = tailscaleProcedures[0]!;
