import { afterEach, describe, expect, it } from "vitest";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { tailscaleExecutable } from "./procedures.js";
import { createTailscaleModule, tailscaleModule } from "./module.js";
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

  it("reports a program that does not start: the program comes from the module", async () => {
    const registry = createRegistry(createTailscaleModule({ executable: "tailscale-that-does-not-exist-0" }));
    const call = invokePath(["tailscale", "run"], { path: ["status"] }, { registry }).then((output) => outputValue(output, ["tailscale", "run"]));
    await expect(call).rejects.toThrow(/tailscale did not start/);
    expect(createTailscaleModule()).toBe(tailscaleModule);
  });

  // Audit pass 2 (O55): before, the input executable let the caller start any program
  it("refuses an input that names the program, and starts nothing", async () => {
    const registry = createRegistry(tailscaleModule);
    const call = invokePath(["tailscale", "run"], { path: ["status"], executable: "/bin/sh" }, { registry }).then((output) => outputValue(output, ["tailscale", "run"]));
    await expect(call).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call).rejects.toThrow(/takes its program from the host/);
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
