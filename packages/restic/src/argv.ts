/**
 * The argv of a CLI command from a command path, named arguments and positional arguments. The
 * procedures start the program with argv, never through a shell.
 */

export type ArgValue = string | number | boolean | readonly string[];

/** A flag name: lowercase letters, digits and hyphens. */
export const FLAG_NAME: RegExp = /^[a-z][a-z0-9-]*$/;

/**
 * This function gives the argv: the path, then each named argument, then `--` and the positional
 * arguments. `true` gives `--key`, `false` gives nothing, a list gives `--key=value` for each
 * value, and another value gives `--key=value`.
 */
export function buildArgv(input: {
  readonly path: readonly string[];
  readonly args?: Readonly<Record<string, ArgValue>> | undefined;
  readonly positional?: readonly string[] | undefined;
  readonly flags?: readonly string[] | undefined;
}): string[] {
  const argv = [...input.path, ...(input.flags ?? [])];
  for (const [key, value] of Object.entries(input.args ?? {})) {
    if (!FLAG_NAME.test(key)) throw new Error(`The argument name "${key}" is not a flag name (lowercase letters, digits, hyphens)`);
    if (value === false) continue;
    if (value === true) argv.push(`--${key}`);
    else if (Array.isArray(value)) for (const item of value) argv.push(`--${key}=${item}`);
    else argv.push(`--${key}=${String(value)}`);
  }
  if (input.positional && input.positional.length > 0) argv.push("--", ...input.positional);
  return argv;
}

/** This function reads JSON output: one document, or one document on each line (NDJSON). */
export function parseJsonOutput(stdout: string): unknown {
  const text = stdout.trim();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    try {
      return lines.map((line) => JSON.parse(line) as unknown);
    } catch {
      return undefined;
    }
  }
}
