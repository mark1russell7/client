// The JSON lines of the programs of the procedures subject: the WebSocket client and the server.
//
// Each line has `ev` and `t`, as the TCP client of the harness of systems writes them. `t` is
// process.hrtime, which libuv reads from CLOCK_MONOTONIC: the clock that the prober stamps the
// records of the kernel with. A write to a pipe is synchronous on Linux, thus a line goes out
// before the program does the act that it announces.
//
// The image puts these programs in the folder of the deployed @procedures/client (/opt/subject).
// Thus `import "@procedures/client"` is a self-reference of that package, and `import "ws"` finds
// the one copy of ws that the package uses.

import { existsSync, readFileSync } from "node:fs";

/** This function gives the time now, in nanoseconds on CLOCK_MONOTONIC. */
export const now = (): bigint => process.hrtime.bigint();

/** This function writes one line, with the time `at` (the time now when none is given). */
export const emit = (ev: string, fields: Record<string, unknown> = {}, at: bigint = now()): boolean =>
  process.stdout.write(`${JSON.stringify({ ev, t: Number(at), ...fields })}\n`);

/** This function gives the boot id of the kernel, or null where the file does not exist. */
export const bootId = (): string | null => {
  try {
    return readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
  } catch {
    return null;
  }
};

/**
 * This function gives the name and the version of the package that the programs run, from the
 * package.json beside them: for example `@procedures/client 0.20.0`. It fails when that file is
 * not the file of @procedures/client, because the self-reference then finds no package.
 */
export const subjectPackage = (): string => {
  const manifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { name: string; version: string };
  if (manifest.name !== "@procedures/client") throw new Error(`the programs are not in @procedures/client: package.json names ${manifest.name}`);
  return `${manifest.name} ${manifest.version}`;
};

/** The command line of a program: its positional arguments, and the readers of its flags. */
export interface CommandLine {
  args: string[];
  flag(name: string): string | undefined;
  required(name: string): string;
  number(name: string): number;
  toggle(name: string): boolean;
  fail(why: string): never;
}

/**
 * This function reads the command line: positional arguments first, then `--name value` pairs.
 * A setting that the caller must give and does not is a failure: the program has no default.
 */
export const commandLine = (usage: string, positional = 0): CommandLine => {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const at = argv.indexOf(name);
    return at === -1 ? undefined : argv[at + 1];
  };
  const fail: (why: string) => never = (why) => {
    emit("fail", { why: `${why}. Usage: ${usage}` });
    process.exit(1);
  };
  const required = (name: string): string => {
    const value = flag(name);
    if (value === undefined) fail(`no ${name}`);
    return value;
  };
  const number = (name: string): number => {
    const value = Number(required(name));
    if (!Number.isFinite(value)) fail(`${name} is not a number`);
    return value;
  };
  const toggle = (name: string): boolean => {
    const value = required(name);
    if (value !== "on" && value !== "off") fail(`${name} is on or off`);
    return value === "on";
  };
  const args = argv.slice(0, positional);
  if (args.length < positional || args.some((arg) => arg.startsWith("--"))) fail("the positional arguments are missing");
  return { args, flag, required, number, toggle, fail };
};

/** This function waits until the file at `path` exists. It looks each 2 ms, as the other clients of the harness do. */
export const waitFor = (path: string): Promise<void> =>
  new Promise((resolve) => {
    const look = setInterval(() => {
      if (!existsSync(path)) return;
      clearInterval(look);
      resolve();
    }, 2);
  });
