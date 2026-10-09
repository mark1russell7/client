/**
 * The command line rules of mark (deep dive CLI-7, CLI-9, CLI-10, CLI-11).
 */

import { describe, it, expect } from "vitest";
import { parseCommandLine, parseLeadingGlobals } from "./args.js";
import { testProcedures } from "../test/procedures.js";

const procedures = testProcedures();
const parse = (line: string[]) => parseCommandLine(line, procedures);

describe("global flags and procedure flags (CLI-7)", () => {
  it("gives a short flag that the procedure declares to the procedure", () => {
    const down = parse(["docker", "compose", "down", "-v"]);
    expect(down.errors).toEqual([]);
    expect(down.path).toEqual(["docker", "compose", "down"]);
    expect(down.input).toEqual({ volumes: true });
    expect(down.globals.version).toBeUndefined();

    const exec = parse(["docker", "exec", "-i", "box", "sh"]);
    expect(exec.input).toEqual({ interactive: true, container: "box", command: ["sh"] });
    expect(exec.globals.interactive).toBeUndefined();

    const vite = parse(["vite", "dev", "-h", "0.0.0.0"]);
    expect(vite.input).toEqual({ host: "0.0.0.0" });
    expect(vite.globals.help).toBeUndefined();
  });

  it("gives a long flag that the procedure declares to the procedure", () => {
    const ps = parse(["docker", "ps", "--format", "{{.ID}}"]);
    expect(ps.errors).toEqual([]);
    expect(ps.input).toEqual({ format: "{{.ID}}" });
    expect(ps.globals.format).toBeUndefined();
  });

  it("reads a flag that the procedure does not declare as a global flag", () => {
    expect(parse(["fs", "exists", "x", "-h"]).globals.help).toBe(true);
    expect(parse(["git", "commit", "-v"]).globals.version).toBe(true);
    expect(parse(["fs", "exists", "x", "--format", "json"]).globals.format).toBe("json");
    expect(parse(["fs", "exists", "x", "-f", "json"]).globals.format).toBe("json");
  });

  it("reads each flag before the command path as a global flag", () => {
    const line = parse(["-v", "--format", "json", "docker", "compose", "down", "-v"]);
    expect(line.globals).toEqual({ version: true, format: "json" });
    expect(line.input).toEqual({ volumes: true });
  });

  it("reads the leading global flags without the procedures", () => {
    expect(parseLeadingGlobals(["--server", "--port=4000", "--host", "::1"])).toEqual({
      globals: { server: true, port: "4000", host: "::1" },
      rest: [],
      errors: [],
    });
    expect(parseLeadingGlobals(["docker", "exec", "-i"]).globals).toEqual({});
    expect(parseLeadingGlobals(["--cwd", "x", "git", "status"]).errors).toEqual([
      "Unknown option before the command: --cwd",
    ]);
  });

  it("reports a flag that neither the procedure nor the globals have", () => {
    expect(parse(["fs", "exists", "x", "--bogus"]).errors).toEqual(["Unknown option for mark fs exists: --bogus"]);
    expect(parse(["docker", "exec", "-iz", "box", "sh"]).errors).toEqual(["Unknown option -z in -iz"]);
  });

  it("passes the flags of a procedure with no readable schema through", () => {
    const line = parse(["untyped", "--some-flag", "value", "--count", "3", "--on"]);
    expect(line.errors).toEqual([]);
    expect(line.input).toEqual({ someFlag: "value", count: 3, on: true });
  });
});

describe("conversion by the field type (CLI-9)", () => {
  it("keeps the text of a string field", () => {
    expect(parse(["fs", "exists", "2024"]).input).toEqual({ path: "2024" });
    expect(parse(["fs", "exists", "007"]).input).toEqual({ path: "007" });
    expect(parse(["fs", "exists", "true"]).input).toEqual({ path: "true" });
    expect(parse(["fs", "exists", '{"a":1}']).input).toEqual({ path: '{"a":1}' });
    expect(parse(["fs", "exists", "12345678901234567890"]).input).toEqual({ path: "12345678901234567890" });
    expect(parse(["git", "commit", "-m", "42"]).input).toEqual({ message: "42" });
  });

  it("converts a number field, and reports text that is not a number", () => {
    expect(parse(["git", "commit", "--count", "007"]).input).toEqual({ count: 7 });
    expect(parse(["git", "commit", "--count", "1.5e3"]).input).toEqual({ count: 1500 });
    expect(parse(["git", "commit", "--count", "abc"]).errors).toEqual(['--count needs a number, not "abc"']);
  });

  it("reads JSON for a field with no type, but keeps a whole number that a number cannot hold", () => {
    expect(parse(["git", "commit", "--data", '{"a":[1,2]}']).input).toEqual({ data: { a: [1, 2] } });
    expect(parse(["git", "commit", "--data", "hello"]).input).toEqual({ data: "hello" });
    expect(parse(["git", "commit", "--data", "12345678901234567890"]).input).toEqual({ data: "12345678901234567890" });
  });

  it("converts unions, objects and enums", () => {
    expect(parse(["git", "commit", "--id", "5"]).input).toEqual({ id: "5" });
    expect(parse(["git", "commit", "--level", "5"]).input).toEqual({ level: 5 });
    expect(parse(["git", "commit", "--level", "true"]).input).toEqual({ level: true });
    expect(parse(["git", "commit", "--options", '{"a":1}']).input).toEqual({ options: { a: 1 } });
    expect(parse(["git", "commit", "--options", "x"]).errors).toEqual(['--options needs a JSON object, not "x"']);
    expect(parse(["git", "commit", "--mode", "fast"]).input).toEqual({ mode: "fast" });
  });
});

describe("arrays, records and positional arguments (CLI-10)", () => {
  it("collects a repeated array flag, and accepts a JSON array", () => {
    expect(parse(["git", "commit", "--tags", "a", "--tags", "b"]).input).toEqual({ tags: ["a", "b"] });
    expect(parse(["git", "commit", "--tags", '["a","b"]']).input).toEqual({ tags: ["a", "b"] });
  });

  it("merges a repeated record flag given as key=value", () => {
    const line = parse(["docker", "exec", "box", "sh", "--env", "A=1", "--env", "B=x=y"]);
    expect(line.errors).toEqual([]);
    expect(line.input["env"]).toEqual({ A: "1", B: "x=y" });
    expect(parse(["docker", "exec", "box", "sh", "--env", "novalue"]).errors).toEqual([
      '--env needs key=value, not "novalue"',
    ]);
  });

  it("gives the rest of the arguments to a last array positional", () => {
    expect(parse(["docker", "exec", "box", "ls", "-la", "/tmp"]).errors).toEqual(["Unknown option -l in -la"]);
    const line = parse(["docker", "exec", "box", "--", "ls", "-la", "/tmp"]);
    expect(line.errors).toEqual([]);
    expect(line.input).toEqual({ container: "box", command: ["ls", "-la", "/tmp"] });
  });

  it("gives one argument to an array positional that is not last", () => {
    expect(parse(["copy", "a", "b"]).input).toEqual({ sources: ["a"], dest: "b" });
  });

  it("reports an argument that no positional field takes", () => {
    expect(parse(["fs", "exists", "a", "b", "c"]).errors).toEqual(["Unexpected arguments for mark fs exists: b c"]);
    expect(parse(["git", "commit", "now"]).errors).toEqual(["Unexpected argument for mark git commit: now"]);
  });

  it("reports a field that is given as an argument and as a flag", () => {
    expect(parse(["fs", "exists", "a", "--path", "b"]).errors).toEqual([
      "path is given twice: as an argument and as --path",
    ]);
  });
});

describe("booleans, negative numbers and -- (CLI-11)", () => {
  it("reads true or false after a boolean flag", () => {
    expect(parse(["git", "commit", "--dry-run", "false"]).input).toEqual({ dryRun: false });
    expect(parse(["git", "commit", "--amend", "false", "-m", "x"]).input).toEqual({ amend: false, message: "x" });
    expect(parse(["git", "commit", "--dry-run=false"]).input).toEqual({ dryRun: false });
    expect(parse(["git", "commit", "--dry-run", "true"]).input).toEqual({ dryRun: true });
    expect(parse(["git", "commit", "--dry-run"]).input).toEqual({ dryRun: true });
    expect(parse(["git", "commit", "--dryRun"]).input).toEqual({ dryRun: true });
    expect(parse(["git", "commit", "-d", "false"]).input).toEqual({ dryRun: false });
  });

  it("reads --no-<flag> as false", () => {
    expect(parse(["git", "commit", "--no-dry-run"]).input).toEqual({ dryRun: false });
    expect(parse(["git", "commit", "--no-amend=x"]).errors).toEqual(["--no-amend takes no value"]);
  });

  it("reads a negative number as a value", () => {
    expect(parse(["git", "commit", "--count", "-5"]).input).toEqual({ count: -5 });
    expect(parse(["git", "commit", "-n", "-0.5"]).input).toEqual({ count: -0.5 });
    expect(parse(["git", "commit", "-m", "-1"]).input).toEqual({ message: "-1" });
  });

  it("reads the arguments after -- as arguments, not flags", () => {
    expect(parse(["fs", "exists", "--", "--weird-name"]).input).toEqual({ path: "--weird-name" });
  });

  it("reads clusters of short flags and a value attached to a short flag", () => {
    expect(parse(["docker", "exec", "-it", "box", "sh"]).input).toEqual({
      interactive: true,
      tty: true,
      container: "box",
      command: ["sh"],
    });
    expect(parse(["git", "commit", "-n5"]).input).toEqual({ count: 5 });
    expect(parse(["git", "commit", "-n=5"]).input).toEqual({ count: 5 });
    expect(parse(["git", "commit", "-dA"]).input).toEqual({ dryRun: true, amend: true });
  });

  it("reports a flag that needs a value and has none", () => {
    expect(parse(["git", "commit", "--message"]).errors).toEqual(["--message needs a value"]);
    expect(parse(["git", "commit", "-m", "--amend"]).errors).toEqual(["-m needs a value"]);
  });
});
