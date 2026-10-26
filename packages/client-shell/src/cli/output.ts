/**
 * The shared output of a CLI tool procedure: the result of `shell.run` with `success` and the
 * time of the call. The schemas are loose, so a field that a schema does not name stays.
 */

import { z } from "zod";

/** The result of one command of a CLI tool. */
export interface CliToolOutput {
  /** The exit code of the program (0 is success) */
  exitCode: number;
  /** The standard output */
  stdout: string;
  /** The standard error, or the error message when the program did not start */
  stderr: string;
  /** True when the exit code is 0 */
  success: boolean;
  /** The time of the command, in milliseconds */
  duration: number;
}

/** The result of a command that writes JSON: `data` is its parsed standard output. */
export interface CliToolJsonOutput extends CliToolOutput {
  /** The parsed JSON of the standard output. It is absent when the output is not JSON. */
  data?: unknown;
}

/** The fields of the output schema of a tool, as a shape for `z.looseObject()`. */
export interface CliToolOutputFields {
  exitCode: z.ZodNumber;
  stdout: z.ZodString;
  stderr: z.ZodString;
  success: z.ZodBoolean;
  duration: z.ZodNumber;
}

/** This function gives the fields of the output schema, with descriptions that name the program. */
export function cliToolOutputFields(program: string): CliToolOutputFields {
  return {
    exitCode: z.number().describe(`The exit code of ${program} (0 is success)`),
    stdout: z.string().describe(`The standard output of ${program}`),
    stderr: z.string().describe(`The standard error of ${program}, or the error message when ${program} did not start`),
    success: z.boolean().describe("True when the exit code is 0"),
    duration: z.number().describe("The time of the command, in milliseconds"),
  };
}

/** This function gives the loose output schema of a command of the program. */
export function cliToolOutputSchema(program: string): z.ZodType<CliToolOutput> {
  return z.looseObject(cliToolOutputFields(program));
}

/** This function gives the loose output schema of a command of the program that writes JSON. */
export function cliToolJsonOutputSchema(program: string): z.ZodType<CliToolJsonOutput> {
  return z.looseObject({
    ...cliToolOutputFields(program),
    data: z.unknown().optional().describe("The parsed JSON of the standard output, when it is JSON"),
  });
}
