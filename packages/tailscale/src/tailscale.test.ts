import { afterEach, describe, expect, it } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import { tailscaleExecutable, tailscaleProcedures } from "./procedures.js";
import { parseJsonOutput } from "./argv.js";

afterEach(() => {
  delete process.env["TAILSCALE_EXE"];
});

describe("tailscale.run", () => {
  it("uses the given program, then TAILSCALE_EXE", () => {
    expect(tailscaleExecutable("/opt/ts")).toBe("/opt/ts");
    process.env["TAILSCALE_EXE"] = "/usr/local/bin/tailscale";
    expect(tailscaleExecutable()).toBe("/usr/local/bin/tailscale");
  });

  it("reports a program that does not start", async () => {
    const registry = new ProcedureRegistry();
    for (const procedure of tailscaleProcedures) registry.register(procedure);
    const call = invokePath(["tailscale", "run"], { path: ["status"], executable: "tailscale-that-does-not-exist-0" }, { registry }).then(
      (output) => outputValue(output, ["tailscale", "run"])
    );
    await expect(call).rejects.toThrow(/tailscale did not start/);
  });
});

describe("parseJsonOutput", () => {
  it("reads one JSON document or NDJSON, and skips a blank line between the documents", () => {
    expect(parseJsonOutput('{"Self":{"Online":true}}')).toEqual({ Self: { Online: true } });
    expect(parseJsonOutput('{"a":1}\n\n  \r\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
    expect(parseJsonOutput("not json")).toBeUndefined();
    expect(parseJsonOutput("\n\n")).toBeUndefined();
  });
});
