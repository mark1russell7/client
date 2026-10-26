/**
 * The tests of `createProcedureCli()` with a small registry of fake procedures. The tests use no
 * file, no terminal and no network: the file reader, the terminal and the asker are fakes.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createProcedure, outputSchema, ProcedureRegistry, type AnyProcedure } from "@procedures/client";
import { createProcedureCli, type CliClient, type ProcedureCliOptions } from "./cli.js";
import type { Print } from "./format.js";
import type { CLIMeta } from "./fields.js";

function procedure(path: string[], schema: z.ZodTypeAny, meta: CLIMeta, handler: (input: never) => unknown): AnyProcedure {
  return createProcedure()
    .path(path)
    .input(schema)
    .output(outputSchema<unknown>())
    .meta(meta as Record<string, unknown>)
    .handler(async (input: unknown) => handler(input as never))
    .build() as unknown as AnyProcedure;
}

/** The fake procedures: a greeting, a job status, a failure and a sum. */
function fakeProcedures(): AnyProcedure[] {
  return [
    procedure(
      ["greet"],
      z.object({ name: z.string().describe("The name"), loud: z.boolean().default(false) }),
      { description: "Say hello", args: ["name"], shorts: { loud: "l" } },
      ({ name, loud }: { name: string; loud: boolean }) => ({ message: loud ? `HELLO ${name.toUpperCase()}` : `Hello ${name}` })
    ),
    procedure(
      ["job", "status"],
      z.object({ id: z.string(), all: z.boolean().optional() }),
      { description: "The state of a job", args: ["id"], shorts: { all: "a" } },
      ({ id, all }: { id: string; all?: boolean }) => ({ id, state: "running", all: all === true })
    ),
    procedure(["job", "fail"], z.object({}), { description: "A job that fails" }, () => ({ success: false, error: "no slot" })),
    procedure(
      ["sum"],
      z.object({ values: z.array(z.number()) }),
      { description: "Add numbers", args: ["values"] },
      ({ values }: { values: number[] }) => values.reduce((a, b) => a + b, 0)
    ),
  ];
}

/** A print that records each message. */
function recorder(): { print: Print; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const print: Print = {
    info: (m) => out.push(m),
    success: (m) => out.push(m),
    warning: (m) => err.push(m),
    error: (m) => err.push(m),
    table: (rows) => out.push(rows.map((row) => row.join("|")).join("\n")),
    spin: (m) => ({ stop: () => {}, succeed: () => {}, fail: () => {}, text: m }),
  };
  return { print, out, err };
}

const NO_TERMINAL = { stdinIsTTY: false, stdoutIsTTY: false, env: {} };

function cli(options: Partial<ProcedureCliOptions> = {}) {
  const rec = recorder();
  const program = createProcedureCli({
    name: "tool",
    version: "1.2.3",
    procedures: fakeProcedures(),
    print: rec.print,
    terminal: NO_TERMINAL,
    readFile: () => {
      throw new Error("no file");
    },
    ...options,
  });
  return { program, ...rec };
}

describe("createProcedureCli", () => {
  it("runs a command with a positional argument and a short flag", async () => {
    const { program, out } = cli();
    expect(await program.run(["greet", "ada", "-l"])).toBe(0);
    expect(out).toEqual(["HELLO ADA"]);
  });

  it("collects the rest of the arguments into a last array field", async () => {
    const { program, out } = cli();
    expect(await program.run(["sum", "1", "2", "3.5"])).toBe(0);
    expect(out).toEqual(["6.5"]);
  });

  it("writes the result as JSON with --json", async () => {
    const { program, out } = cli();
    expect(await program.run(["job", "status", "j1", "--json"])).toBe(0);
    expect(JSON.parse(out.join("\n"))).toEqual({ id: "j1", state: "running", all: false });
  });

  it("uses the format hook of a procedure for the human output only", async () => {
    const format = { "job.status": (result: unknown) => `job ${(result as { id: string }).id}: ${(result as { state: string }).state}` };
    const human = cli({ format });
    expect(await human.program.run(["job", "status", "j2"])).toBe(0);
    expect(human.out).toEqual(["job j2: running"]);

    const json = cli({ format });
    await json.program.run(["job", "status", "j2", "--json"]);
    expect(JSON.parse(json.out.join("\n"))).toMatchObject({ id: "j2" });
  });

  it("gives a hook that prints by itself and returns nothing", async () => {
    const { program, out } = cli({
      format: {
        "job.status": (result, { print }) => {
          print.info("line 1");
          print.info(`line 2 ${(result as { id: string }).id}`);
        },
      },
    });
    await program.run(["job", "status", "j3"]);
    expect(out).toEqual(["line 1", "line 2 j3"]);
  });

  it("reads a value @<file> with readFile, and keeps @@ as text", async () => {
    const files: Record<string, string> = { "name.txt": "grace" };
    const readFile = (path: string): string => {
      const text = files[path];
      if (text === undefined) throw new Error("not found");
      return text;
    };
    const read = cli({ readFile });
    expect(await read.program.run(["greet", "@name.txt"])).toBe(0);
    expect(read.out).toEqual(["Hello grace"]);

    const escaped = cli({ readFile });
    await escaped.program.run(["greet", "@@home"]);
    expect(escaped.out).toEqual(["Hello @home"]);

    const missing = cli({ readFile });
    expect(await missing.program.run(["greet", "@other.txt"])).toBe(1);
    expect(missing.err[0]).toContain("cannot read other.txt");
  });

  it("keeps @ as text when readFile is false", async () => {
    const { program, out } = cli({ readFile: false });
    await program.run(["greet", "@name.txt"]);
    expect(out).toEqual(["Hello @name.txt"]);
  });

  it("takes the input as a JSON object with --data, under the flags", async () => {
    const files: Record<string, string> = { "in.json": '{"name":"lin","loud":true}' };
    const { program, out } = cli({ readFile: (path) => files[path] ?? "" });
    expect(await program.run(["greet", "--data", "@in.json", "--no-loud"])).toBe(0);
    expect(out).toEqual(["Hello lin"]);
  });

  it("asks for a missing argument in a terminal", async () => {
    const asked: string[] = [];
    const { program, out } = cli({
      terminal: { stdinIsTTY: true, stdoutIsTTY: true, env: {} },
      ask: async (field) => {
        asked.push(field.name);
        return { value: "kay" };
      },
    });
    expect(await program.run(["greet"])).toBe(0);
    expect(asked).toEqual(["name"]);
    expect(out).toEqual(["Hello kay"]);
  });

  it("does not ask with --no-input, and reports the missing argument", async () => {
    const { program, err } = cli({
      terminal: { stdinIsTTY: true, stdoutIsTTY: true, env: {} },
      ask: async () => {
        throw new Error("asked");
      },
    });
    expect(await program.run(["greet", "--no-input"])).toBe(1);
    expect(err[0]).toContain("Invalid input for tool greet");
  });

  it("shows the help of the program, of a group and of a command", async () => {
    const root = cli({ description: "A test tool" });
    expect(await root.program.run([])).toBe(0);
    expect(root.out[0]).toBe("tool v1.2.3 - A test tool\n");
    expect(root.out).toContain("    tool job status  The state of a job");

    const group = cli();
    expect(await group.program.run(["job"])).toBe(0);
    expect(group.out).toContain("  tool job status  The state of a job");

    const command = cli();
    expect(await command.program.run(["greet", "--help"])).toBe(0);
    const help = command.out.join("\n");
    expect(help).toContain("Usage: tool greet <name> [options]");
    expect(help).toContain("-l, --loud");
    expect(help).toContain("--json");
    expect(help).not.toContain("--version");
  });

  it("shows the version", async () => {
    const { program, out } = cli();
    expect(await program.run(["--version"])).toBe(0);
    expect(out).toEqual(["tool v1.2.3"]);
  });

  it("gives exit code 1 for an unknown command, an unknown flag and a failed result", async () => {
    const unknown = cli();
    expect(await unknown.program.run(["nope"])).toBe(1);
    expect(unknown.err).toEqual(["Unknown command: tool nope"]);

    const flag = cli();
    expect(await flag.program.run(["greet", "ada", "--bogus"])).toBe(1);
    expect(flag.err).toEqual(["Unknown option for tool greet: --bogus"]);

    const failed = cli();
    expect(await failed.program.run(["job", "fail"])).toBe(1);
    expect(failed.err).toContain("tool job fail failed: no slot");
  });

  it("runs on a registry", async () => {
    const registry = new ProcedureRegistry();
    for (const p of fakeProcedures()) registry.register(p);
    const { program, out } = cli({ procedures: registry });
    expect(await program.run(["greet", "bo"])).toBe(0);
    expect(out).toEqual(["Hello bo"]);
  });

  it("sends the calls to a client that it makes from the global flags", async () => {
    const calls: Array<{ path: unknown; payload: unknown; port: unknown }> = [];
    const { program, out } = cli({
      globals: [{ long: "port", takesValue: true, description: "The port of the daemon" }],
      client: (globals): CliClient => ({
        call: async (method, payload) => {
          calls.push({ path: method, payload, port: globals["port"] });
          return { message: "from the daemon" };
        },
      }),
    });
    expect(await program.run(["--port", "4730", "job", "status", "j9", "-a"])).toBe(0);
    expect(out).toEqual(["from the daemon"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.payload).toEqual({ id: "j9", all: true });
    expect(calls[0]!.port).toBe("4730");
  });

  it("reports an error of the client as one line with exit code 1", async () => {
    const { program, err } = cli({
      client: {
        call: async () => {
          throw new Error("connection refused");
        },
      },
    });
    expect(await program.run(["greet", "ada"])).toBe(1);
    expect(err).toEqual(["Error: connection refused"]);
  });
});
