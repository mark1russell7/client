/**
 * Exit codes and failures of mark (deep dive CLI-8), the REPL (CLI-15), and importing the
 * package without running the CLI (CLI-17).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { Client, LocalTransport, ProcedureRegistry } from "@mark1russell7/client";
import { executeArgs, type CliContext } from "./cli.js";
import { failureOf } from "./failure.js";
import { lineReader, runLines, tokenize } from "./repl.js";
import { PassThrough, Readable } from "node:stream";
import { testProcedures } from "../test/procedures.js";

function context(): CliContext {
  const registry = new ProcedureRegistry();
  const procedures = testProcedures();
  for (const procedure of procedures) {
    registry.register(procedure);
  }
  return {
    client: new Client({ transport: new LocalTransport({ registry }) }),
    procedures,
    verbose: false,
  };
}

/** Run a command line in this process (--local: never a CLI server) and give its exit code */
async function exitCodeOf(argv: string[]): Promise<number> {
  process.exitCode = 0;
  await executeArgs([...argv, "--local"], context());
  return Number(process.exitCode ?? 0);
}

afterEach(() => {
  process.exitCode = 0;
  vi.restoreAllMocks();
});

describe("failureOf", () => {
  it("finds the failure that a result reports", () => {
    expect(failureOf({ success: false, errors: ["no such file"] })).toBe("no such file");
    expect(failureOf({ success: false, error: { message: "boom" } })).toBe("boom");
    expect(failureOf({ success: false })).toBe("success: false");
    expect(failureOf({ exitCode: 3, success: false })).toBe("exit code 3");
    expect(failureOf({ type: "exit", exitCode: 1 })).toBe("exit code 1");
  });

  it("finds no failure in other results", () => {
    expect(failureOf({ success: true })).toBeUndefined();
    expect(failureOf({ exitCode: 0 })).toBeUndefined();
    expect(failureOf({ exists: false })).toBeUndefined();
    expect(failureOf([{ success: false }])).toBeUndefined();
    expect(failureOf("text")).toBeUndefined();
    expect(failureOf(null)).toBeUndefined();
  });
});

describe("exit codes (CLI-8)", () => {
  it("is 0 for a command that succeeds, and for help", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await exitCodeOf(["result", "ok"])).toBe(0);
    expect(await exitCodeOf(["git", "commit", "--help"])).toBe(0);
    expect(await exitCodeOf(["docker"])).toBe(0);
  });

  it("is 1 for an unknown command, a bad command line and invalid input", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await exitCodeOf(["nosuch"])).toBe(1);
    expect(await exitCodeOf(["docker", "nosuch"])).toBe(1);
    expect(await exitCodeOf(["fs", "exists", "a", "b"])).toBe(1);
    expect(await exitCodeOf(["git", "commit", "--count", "x"])).toBe(1);
    // fs exists needs its path
    expect(await exitCodeOf(["fs", "exists"])).toBe(1);
    expect(await exitCodeOf(["git", "commit", "--format", "xml"])).toBe(1);
  });

  it("is 1 for a thrown error, success: false, and an exit code that is not 0", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await exitCodeOf(["result", "throws"])).toBe(1);
    expect(await exitCodeOf(["result", "fails"])).toBe(1);
    expect(errors.mock.calls.flat().join("\n")).toContain("mark result fails failed: it broke");
    expect(await exitCodeOf(["result", "exit"])).toBe(1);
  });

  it("is 1 for a mode flag after a command", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await exitCodeOf(["fs", "exists", "x", "--server"])).toBe(1);
    expect(await exitCodeOf(["fs", "exists", "x", "--port", "4000"])).toBe(1);
  });
});

describe("the REPL (CLI-15)", () => {
  it("runs the lines one at a time, in order, and returns after the last one", async () => {
    async function* lines(): AsyncGenerator<string> {
      yield "first one";
      yield "   ";
      yield 'second "two words" \'\'';
    }
    const events: string[] = [];
    await runLines(lines(), async (argv) => {
      events.push(`start ${argv.join("|")}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      events.push(`end ${argv[0]}`);
    });
    expect(events).toEqual(["start first|one", "end first", "start second|two words|", "end second"]);
  });

  it("runs every line of a piped script when the input ends while a command runs", async () => {
    const input = Readable.from(["first\nsecond\n", "third\n"]);
    const output = new PassThrough();
    output.resume();
    const reader = lineReader(input, output);
    const done: string[] = [];
    await runLines(
      reader.lines,
      async (argv) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        done.push(argv[0]!);
      },
      reader.prompt
    );
    expect(done).toEqual(["first", "second", "third"]);
  });

  it("keeps a quoted empty string as an argument", () => {
    expect(tokenize(`fs write a.txt --content ""`)).toEqual(["fs", "write", "a.txt", "--content", ""]);
    expect(tokenize(`  a  'b c'  `)).toEqual(["a", "b c"]);
  });
});

describe("importing the package (CLI-17)", () => {
  it("runs nothing", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const module = await import("./index.js");
    expect(typeof module.run).toBe("function");
    expect(log).not.toHaveBeenCalled();
  });
});
