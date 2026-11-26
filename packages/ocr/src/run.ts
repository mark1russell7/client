/**
 * The run of the programs of this package. Each program starts as argv through a nested
 * `shell.run` call (`defineCliTool` of `@procedures/shell`). No shell starts. The engine of
 * the host applies its rules to that call, and a cancel stops the program.
 */

import type { ProcedureContext } from "@procedures/client";
import { CliToolError, defineCliTool, type CliTool } from "@procedures/shell/cli";
import { tesseractEngine, type OcrEngine } from "./engine.js";
import { OcrToolMissingError, requireProgram, type FindProgramOptions, type ProgramSpec } from "./programs.js";

/** The default time limit of one program, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** The settings of the host for the procedures of this package. The procedure input cannot change them. */
export interface OcrHostOptions extends FindProgramOptions {
  /**
   * The path of each program, by name: `tesseract`, `pdftotext`, `pdftoppm` or `pdfinfo`. A
   * program with no path comes from the search of `findProgram`.
   */
  readonly executables?: Readonly<Record<string, string | undefined>> | undefined;
  /** The OCR engine (default: `tesseractEngine`). */
  readonly engine?: OcrEngine | undefined;
  /** The folder of the temporary folders (default: the temporary folder of the system). */
  readonly tempFolder?: string | undefined;
}

/** The programs of one host, ready to start. */
export interface OcrRunner {
  readonly engine: OcrEngine;
  readonly tempFolder: string | undefined;
  /** This function starts a program and gives its standard output. */
  run(spec: ProgramSpec, args: readonly string[], timeout: number, ctx: Pick<ProcedureContext, "client">): Promise<string>;
}

/**
 * True when the output of `shell.run` tells that the program is not there. `shell.run` gives exit
 * code 1 and the error of the start as the standard error, for example `spawn tesseract ENOENT`.
 */
function notFound(result: { exitCode: number; stdout: string; stderr: string }): boolean {
  return result.exitCode === 1 && result.stdout === "" && /^spawn .+ ENOENT$/.test(result.stderr.trim());
}

/** This function gives the runner of the programs with the settings of the host. */
export function createOcrRunner(options: OcrHostOptions = {}): OcrRunner {
  const engine = options.engine ?? tesseractEngine;
  const find: FindProgramOptions = { env: options.env, platform: options.platform, exists: options.exists };
  const tools = new Map<string, CliTool>();
  const toolOf = (spec: ProgramSpec): CliTool => {
    let tool = tools.get(spec.name);
    if (tool === undefined) {
      tool = defineCliTool({ name: spec.name, resolve: () => requireProgram(spec, { ...find, executable: options.executables?.[spec.name] }) });
      tools.set(spec.name, tool);
    }
    return tool;
  };
  return {
    engine,
    tempFolder: options.tempFolder,
    async run(spec, args, timeout, ctx) {
      const tool = toolOf(spec);
      const input = tool.shellInput(args, { timeout });
      const result = await tool.call(args, { timeout }, ctx);
      if (notFound(result)) throw new OcrToolMissingError(spec, [input.command], result.stderr.trim());
      if (result.exitCode !== 0) {
        const other = spec.others?.find((program) => program.matches(`${result.stderr}\n${result.stdout}`));
        if (other !== undefined) throw new OcrToolMissingError(spec, [input.command], undefined, other.name);
        const text = result.stderr.trim() || result.stdout.trim();
        throw new CliToolError(`${spec.name} failed (exit code ${result.exitCode}): ${text}`.trim(), result.exitCode, result.stderr);
      }
      return result.stdout;
    },
  };
}
