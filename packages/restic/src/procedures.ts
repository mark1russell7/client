/**
 * The procedure of `@procedures/restic`: `restic.run`, one procedure for each restic command.
 *
 * restic reads the repository and its keys from the environment (`RESTIC_REPOSITORY`,
 * `RESTIC_PASSWORD`, `B2_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID` and the others), so no secret is an
 * input. `restic.run` refuses each input that lets the caller choose a program for restic to
 * start (`resticArgv`).
 *
 * A host gives secrets only to the restic process with the `env` option of `runRestic()` or of
 * `createResticProcedures()`. The procedure input has no field for them.
 */

import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client";
import { runCommand, type CommandOptions, type CommandResult } from "@procedures/shell/command";
import { z } from "zod";
import { buildArgv, parseJsonOutput, type ArgValue } from "./argv.js";

/**
 * The flags that `restic.run` refuses: each one names a program for restic to start.
 * `password-command2` is the hidden old name of `from-password-command`.
 */
const REFUSED_FLAGS = new Set(["password-command", "from-password-command", "password-command2"]);

/** The flags of extended options (`-o key=value`). `o` gives `--o`, which restic refuses, but the check is the same. */
const OPTION_FLAGS = new Set(["option", "o"]);

/**
 * The extended options that start a program: the command or the arguments of `ssh` for an sftp
 * repository, and the program or the arguments of `rclone` for an rclone repository.
 */
const PROGRAM_OPTIONS = ["sftp.command", "sftp.args", "rclone.program", "rclone.args"] as const;

/** The flags whose value is a repository location. `repo2` is the hidden old name of `from-repo`. */
const REPOSITORY_FLAGS = new Set(["repo", "from-repo", "repo2"]);

/** The values of one named argument, as texts. */
function argTexts(value: ArgValue): string[] {
  if (Array.isArray(value)) return [...value];
  return typeof value === "boolean" ? [] : [String(value)];
}

/**
 * The program option that an `--option` value sets, or undefined. restic reads the value as a list
 * of `key=value` pairs separated with commas, with quotes, and it ignores the case and the spaces of
 * a key. A key is one run of characters in each of these forms, so a search in the lowercase value
 * finds each spelling.
 */
function programOption(value: string): string | undefined {
  const text = value.toLowerCase();
  return PROGRAM_OPTIONS.find((key) => text.includes(key));
}

/** The text with its percent escapes decoded, or the text itself when an escape is not valid. */
function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * The reason to refuse a repository location, or undefined. restic gives the host of an sftp
 * repository to `ssh`, and the remote of an rclone repository to `rclone`, as one argument. A value
 * that starts with `-` becomes an option of that program, and an option of `ssh` can start a program.
 */
function repositoryRefusal(location: string): string | undefined {
  let target: string | undefined;
  if (location.startsWith("sftp://")) {
    // restic reads this form as a URL: the host comes without its brackets and with its escapes decoded
    const authority = location.slice("sftp://".length).split("/")[0] ?? "";
    target = decoded(authority.slice(authority.lastIndexOf("@") + 1)).replace(/^\[/, "");
  } else if (location.startsWith("sftp:")) {
    const head = location.slice("sftp:".length).split(":")[0] ?? "";
    target = head.split("@").slice(-1)[0];
  } else if (location.startsWith("rclone:")) {
    target = location.slice("rclone:".length);
  }
  return target?.startsWith("-") ? "the host or the remote of the repository starts with -, so ssh or rclone reads it as an option" : undefined;
}

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
  /** Present when an output stream was longer than `maxOutputBytes`: which one lost bytes. */
  truncated?: { stdout: boolean; stderr: boolean } | undefined;
}
type RunOutput = ResticResult;
const RunOutputSchema = z.object({
  exitCode: z.number(),
  success: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  json: z.unknown().optional(),
  truncated: z.object({ stdout: z.boolean(), stderr: z.boolean() }).optional(),
});

/** A restic command: the subcommand path, its arguments and the repository. */
export interface ResticCommand {
  readonly path: readonly string[];
  readonly positional?: readonly string[] | undefined;
  readonly args?: Readonly<Record<string, ArgValue>> | undefined;
  readonly repository?: string | undefined;
  readonly json?: boolean | undefined;
}

/**
 * This function gives the argv of a restic command. It refuses each input that lets the caller
 * choose a program for restic to start:
 *
 * - the flags `--password-command`, `--from-password-command` and `--password-command2`;
 * - an extended option (`--option`) that sets `sftp.command`, `sftp.args`, `rclone.program` or
 *   `rclone.args`, in each spelling that restic reads;
 * - an sftp or rclone repository whose host or remote starts with `-` (`repository`, `--repo`,
 *   `--from-repo`, `--repo2`);
 * - a positional argument that starts with `-` after a last flag without a value. A flag that
 *   takes a value then reads the `--` that ends the flags, and restic reads the next arguments as flags.
 */
export function resticArgv(input: ResticCommand): string[] {
  const entries = Object.entries(input.args ?? {});
  for (const [key, value] of entries) {
    if (REFUSED_FLAGS.has(key)) throw new Error(`restic.run refuses --${key}: it starts a program`);
    for (const text of argTexts(value)) {
      const option = OPTION_FLAGS.has(key) ? programOption(text) : undefined;
      if (option !== undefined) throw new Error(`restic.run refuses the option ${option}: it starts a program`);
      const refusal = REPOSITORY_FLAGS.has(key) ? repositoryRefusal(text) : undefined;
      if (refusal !== undefined) throw new Error(`restic.run refuses --${key}: ${refusal}`);
    }
  }
  const repositoryProblem = input.repository !== undefined ? repositoryRefusal(input.repository) : undefined;
  if (repositoryProblem !== undefined) throw new Error(`restic.run refuses the repository: ${repositoryProblem}`);
  // The last named argument that gives argv an element: false and an empty list give none
  const last = entries.filter(([, value]) => value !== false && !(Array.isArray(value) && value.length === 0)).at(-1);
  if (last?.[1] === true && (input.positional ?? []).some((item) => item.startsWith("-"))) {
    throw new Error(
      `restic.run refuses a positional argument that starts with - after the flag --${last[0]} without a value: put a flag with a value last, or start the argument with ./`
    );
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
  /**
   * The most bytes kept of each output stream (default: 64 MiB, the default of `runCommand`).
   * `restic ls` of a large snapshot can give more. Past the limit, the result has `truncated`.
   */
  readonly maxOutputBytes?: number | undefined;
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
    ...(options.maxOutputBytes !== undefined ? { maxOutputBytes: options.maxOutputBytes } : {}),
  });
  if (result.error) throw new Error(`restic did not start: ${result.error}`);
  const parsed = json ? parseJsonOutput(result.stdout) : undefined;
  return {
    exitCode: result.exitCode,
    success: result.exitCode === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(parsed !== undefined ? { json: parsed } : {}),
    ...(result.truncated !== undefined ? { truncated: result.truncated } : {}),
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
