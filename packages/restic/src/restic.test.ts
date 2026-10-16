import { describe, expect, it } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import { buildArgv, parseJsonOutput } from "./argv.js";
import { resticArgv, resticProcedures } from "./procedures.js";

describe("argv", () => {
  it("puts the path, the flags, the named arguments, then -- and the positional arguments", () => {
    expect(
      buildArgv({ path: ["backup"], flags: ["--json"], args: { tag: ["daily", "home"], "one-file-system": true, "dry-run": false, limit: 3 }, positional: ["-dir"] })
    ).toEqual(["backup", "--json", "--tag=daily", "--tag=home", "--one-file-system", "--limit=3", "--", "-dir"]);
  });

  it("refuses an argument name that is not a flag name", () => {
    expect(() => buildArgv({ path: ["x"], args: { "--repo": "y" } })).toThrow(/not a flag name/);
  });

  it("reads one JSON document or NDJSON", () => {
    expect(parseJsonOutput('[{"id":"a"}]')).toEqual([{ id: "a" }]);
    expect(parseJsonOutput('{"a":1}\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
    expect(parseJsonOutput("not json")).toBeUndefined();
    expect(parseJsonOutput("")).toBeUndefined();
  });
});

describe("restic.run", () => {
  it("adds --repo and --json, and refuses --password-command", () => {
    expect(resticArgv({ path: ["snapshots"], repository: "/backups/repo", json: true })).toEqual(["snapshots", "--repo=/backups/repo", "--json"]);
    expect(() => resticArgv({ path: ["snapshots"], json: true, args: { "password-command": "x" } })).toThrow(/refuses --password-command/);
  });

  it("reports a program that does not start", async () => {
    const registry = new ProcedureRegistry();
    for (const procedure of resticProcedures) registry.register(procedure);
    const call = invokePath(["restic", "run"], { path: ["version"], executable: "restic-that-does-not-exist-0" }, { registry }).then((output) =>
      outputValue(output, ["restic", "run"])
    );
    await expect(call).rejects.toThrow(/restic did not start/);
  });
});
