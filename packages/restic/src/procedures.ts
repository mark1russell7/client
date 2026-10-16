/**
 * The procedure of `@procedures/restic`: `restic.run`, one procedure for each restic command.
 *
 * restic reads the repository and its keys from the environment (`RESTIC_REPOSITORY`,
 * `RESTIC_PASSWORD`, `B2_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID` and the others), so no secret is an
 * input. `--password-command` is refused: it starts a program of the caller.
 *
 * A host gives secrets only to the restic process with the `env` option of `runRestic()` or of
 * `createResticProcedures()`. The procedure input has no field for them.
 */

import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { runCommand, type CommandOptions, type CommandResult } from "@procedures/shell/command";
import { z } from "zod";
import { buildArgv, parseJsonOutput, type ArgValue } from "./argv.js";

/** The flags that `restic.run` refuses. */
const REFUSED_FLAGS = new Set(["password-command"]);

const RunInputSchema = z.object({
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
type RunInput = z.infer<typeof RunInputSchema>;

/** The result of a restic command. */
export interface ResticResult {
  exitCode: number;
  success: boolean;
  stdout: string;
  stderr: string;
  /** The JSON output, when `json` is true and restic gave JSON */
  json?: unknown;
}
type RunOutput = ResticResult;
const RunOutputSchema = z.object({
  exitCode: z.number(),
  success: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  json: z.unknown().optional(),
});

/** A restic command: the subcommand path, its arguments and the repository. */
export interface ResticCommand {
  readonly path: readonly string[];
  readonly positional?: readonly string[] | undefined;
  readonly args?: Readonly<Record<string, ArgValue>> | undefined;
  readonly repository?: string | undefined;
  readonly json?: boolean | undefined;
}

/** This function gives the argv of a restic command. It refuses the flags that start a program. */
export function resticArgv(input: ResticCommand): string[] {
  for (const key of Object.keys(input.args ?? {})) {
    if (REFUSED_FLAGS.has(key)) throw new Error(`restic.run refuses --${key}: it starts a program`);
  }
  const flags = [...(input.repository !== undefined ? [`--repo=${input.repository}`] : []), ...(input.json ? ["--json"] : [])];
  return buildArgv({ path: input.path, args: input.args, positional: input.positional, flags });
}

/** A function that starts a program: `runCommand` of `@procedures/shell/command`, or a fake in a test. */
export type ResticRunner = (command: string, options: CommandOptions) => Promise<CommandResult>;

/** The options of `runRestic()` that do not come from the command. */
export interface ResticRunOptions {
  /** The restic program (default: `RESTIC_EXE` of the environment of the host, then `restic`) */
  readonly executable?: string | undefined;
  /**
   * The variables for the restic process only, for example `RESTIC_PASSWORD`,
   * `RESTIC_REPOSITORY` or `B2_ACCOUNT_ID`. They go on top of the environment of the host. The
   * value `undefined` removes a variable of the host from the environment of restic.
   */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  /** The working folder */
  readonly cwd?: string | undefined;
  /** The time limit, in milliseconds. At the limit, the process tree stops. */
  readonly timeout?: number | undefined;
  /** When the signal aborts, the process tree stops. */
  readonly signal?: AbortSignal | undefined;
  /** The function that starts restic (default: `runCommand`). A test gives a fake. */
  readonly run?: ResticRunner | undefined;
}

/**
 * This function starts a restic command with argv, not through a shell, and reads its JSON
 * output. `json` is true when the command does not set it, as in `restic.run`. The `env` values
 * go only to the restic process: the host environment does not change, and the result does not
 * contain them. The function throws when restic does not start. A failed command gives
 * `success: false`.
 *
 * @example
 * ```ts
 * const executable = await findRestic();
 * const result = await runRestic(
 *   { path: ["forget"], args: { "keep-daily": 14, prune: true } },
 *   { executable, env: { RESTIC_REPOSITORY: repository, RESTIC_PASSWORD: password } },
 * );
 * ```
 */
export async function runRestic(command: ResticCommand, options: ResticRunOptions = {}): Promise<ResticResult> {
  const executable = options.executable ?? process.env["RESTIC_EXE"] ?? "restic";
  const json = command.json ?? true;
  const run = options.run ?? runCommand;
  const result = await run(executable, {
    args: resticArgv({ ...command, json }),
    cwd: options.cwd,
    timeout: options.timeout,
    signal: options.signal,
    env: options.env === undefined ? undefined : { ...options.env },
  });
  if (result.error) throw new Error(`restic did not start: ${result.error}`);
  const parsed = json ? parseJsonOutput(result.stdout) : undefined;
  return {
    exitCode: result.exitCode,
    success: result.exitCode === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(parsed !== undefined ? { json: parsed } : {}),
  };
}

/** The settings of the host for the procedures of this package. The procedure input cannot change them. */
export interface ResticProceduresOptions {
  /** The variables for the restic process only, for example `RESTIC_PASSWORD`. Refer to `ResticRunOptions.env`. */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  /** The function that starts restic (default: `runCommand`). A test gives a fake. */
  readonly run?: ResticRunner | undefined;
}

/**
 * This function gives the procedures of this package with the settings of the host. With `env`,
 * each restic process gets those variables, and the caller of `restic.run` does not see them.
 */
export function createResticProcedures(options: ResticProceduresOptions = {}): AnyProcedure[] {
  const run = createProcedure()
    .path(["restic", "run"])
    .input(zodAdapter<RunInput>(RunInputSchema))
    .output(zodAdapter<RunOutput>(RunOutputSchema))
    .meta({
      description: "Run a restic command (backup, snapshots, restore, forget, check)",
      args: ["path"],
      shorts: { cwd: "C", timeout: "t" },
      output: "json",
      // A backup reads files, a restore writes them, and forget and prune delete snapshots. A
      // repository of type sftp or rclone starts that program.
      effects: { reads: ["fs", "network", "process"], writes: ["fs", "network", "process"], destructive: true },
    })
    .handler(
      async (input: RunInput, ctx?: ProcedureContext): Promise<RunOutput> =>
        runRestic(input, { executable: input.executable, env: options.env, cwd: input.cwd, timeout: input.timeout, signal: ctx?.signal, run: options.run }),
    )
    .build() as AnyProcedure;
  return [run];
}

export const resticProcedures: AnyProcedure[] = createResticProcedures();

export const resticRunProcedure: AnyProcedure = resticProcedures[0]!;
