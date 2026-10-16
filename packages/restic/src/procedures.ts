/**
 * The procedure of `@procedures/restic`: `restic.run`, one procedure for each restic command.
 *
 * restic reads the repository and its keys from the environment (`RESTIC_REPOSITORY`,
 * `RESTIC_PASSWORD`, `B2_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID` and the others), so no secret is an
 * input. `--password-command` is refused: it starts a program of the caller.
 */

import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { runCommand } from "@procedures/shell/command";
import { z } from "zod";
import { buildArgv, parseJsonOutput, type ArgValue } from "./argv.js";

/** The flags that `restic.run` refuses. */
const REFUSED_FLAGS = new Set(["password-command"]);

const RunInput = z.object({
  path: z
    .array(z.string().regex(/^[a-z][a-z-]*$/))
    .min(1)
    .describe('The restic command, for example ["snapshots"], ["backup"] or ["forget"]'),
  positional: z.array(z.string()).optional().describe("The positional arguments, for example the paths of a backup"),
  args: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    .optional()
    .describe('The flags: { tag: ["daily"], "keep-daily": 7, "dry-run": true }'),
  repository: z.string().min(1).optional().describe("The repository (--repo). Default: RESTIC_REPOSITORY of the environment."),
  json: z.boolean().default(true).describe("Ask for JSON output (--json) and read it (default: true)"),
  executable: z.string().min(1).optional().describe("The restic program (default: RESTIC_EXE of the environment, then restic)"),
  cwd: z.string().optional().describe("The working folder"),
  timeout: z.number().int().positive().optional().describe("The time limit, in milliseconds"),
});
type RunInput = z.infer<typeof RunInput>;

interface RunOutput {
  exitCode: number;
  success: boolean;
  stdout: string;
  stderr: string;
  /** The JSON output, when `json` is true and restic gave JSON */
  json?: unknown;
}
const RunOutput = z.object({
  exitCode: z.number(),
  success: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  json: z.unknown().optional(),
});

/** This function gives the argv of a restic command. */
export function resticArgv(input: Pick<RunInput, "path" | "positional" | "args" | "repository" | "json">): string[] {
  for (const key of Object.keys(input.args ?? {})) {
    if (REFUSED_FLAGS.has(key)) throw new Error(`restic.run refuses --${key}: it starts a program`);
  }
  const flags = [...(input.repository !== undefined ? [`--repo=${input.repository}`] : []), ...(input.json ? ["--json"] : [])];
  return buildArgv({ path: input.path, args: input.args as Record<string, ArgValue> | undefined, positional: input.positional, flags });
}

export const resticRunProcedure: AnyProcedure = createProcedure()
  .path(["restic", "run"])
  .input(zodAdapter<RunInput>(RunInput))
  .output(zodAdapter<RunOutput>(RunOutput))
  .meta({
    description: "Run a restic command (backup, snapshots, restore, forget, check)",
    args: ["path"],
    shorts: { cwd: "C", timeout: "t" },
    output: "json",
    // A backup reads files, a restore writes them, and forget and prune delete snapshots. A
    // repository of type sftp or rclone starts that program.
    effects: { reads: ["fs", "network", "process"], writes: ["fs", "network", "process"], destructive: true },
  })
  .handler(async (input: RunInput, ctx?: ProcedureContext): Promise<RunOutput> => {
    const executable = input.executable ?? process.env["RESTIC_EXE"] ?? "restic";
    const result = await runCommand(executable, {
      args: resticArgv(input),
      cwd: input.cwd,
      timeout: input.timeout,
      signal: ctx?.signal,
    });
    if (result.error) throw new Error(`restic did not start: ${result.error}`);
    const json = input.json ? parseJsonOutput(result.stdout) : undefined;
    return {
      exitCode: result.exitCode,
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      ...(json !== undefined ? { json } : {}),
    };
  })
  .build() as AnyProcedure;

export const resticProcedures: AnyProcedure[] = [resticRunProcedure];
