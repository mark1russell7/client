/**
 * Guards for values that the git procedures pass to git as positional arguments.
 *
 * execFileSync passes arguments without a shell (BUGS-2026-07 C4), but git itself still reads
 * a positional value that starts with "-" as an option. Some options run commands:
 * `git clone/fetch/pull --upload-pack=<command>` and `git push --receive-pack=<command>`.
 * `git diff --output=<file>` writes a file. Git does not allow a ref, branch or remote name
 * to start with "-", so rejecting such values does not block a legitimate call.
 */

export function gitArg(name: string, value: string): string {
  if (value.startsWith("-")) {
    throw new Error(`Invalid ${name} (must not start with "-"): ${value}`);
  }
  return value;
}

/**
 * Diffs and stash patches can exceed Node's default maxBuffer of 1 MiB (BUGS-2026-07 L6)
 */
export const GIT_MAX_BUFFER: number = 64 * 1024 * 1024;
