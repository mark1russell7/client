import { afterEach, describe, expect, it, vi } from "vitest";
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

  // The new path (audit pass 2, O55): the program comes from the module
  it("reports a program that does not start: the program comes from createTailscaleModule({ executable }), with no notice", async () => {
    const emitWarning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    try {
      const registry = createRegistry(createTailscaleModule({ executable: "tailscale-that-does-not-exist-1" }));
      const call = invokePath(["tailscale", "run"], { path: ["status"] }, { registry }).then((output) => outputValue(output, ["tailscale", "run"]));
      await expect(call).rejects.toThrow(/tailscale did not start/);
      expect(createTailscaleModule()).toBe(tailscaleModule);
      expect(emitWarning).not.toHaveBeenCalled();
    } finally {
      emitWarning.mockRestore();
    }
  });

  it("takes the program from TAILSCALE_EXE", async () => {
    process.env["TAILSCALE_EXE"] = "tailscale-that-does-not-exist-2";
    const call = invokePath(["tailscale", "run"], { path: ["status"] }, { registry: createRegistry(tailscaleModule) }).then((output) =>
      outputValue(output, ["tailscale", "run"])
    );
    await expect(call).rejects.toThrow(/tailscale did not start/);
  });

  // The deprecated path: the input executable still works in 0.28, with one notice in the process
  it("still takes the deprecated input executable, and emits one notice that names the new path", async () => {
    const emitWarning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    try {
      const registry = createRegistry(createTailscaleModule({ executable: "tailscale-of-the-module" }));
      for (let i = 0; i < 2; i++) {
        const call = invokePath(["tailscale", "run"], { path: ["status"], executable: "tailscale-that-does-not-exist-3" }, { registry }).then((output) =>
          outputValue(output, ["tailscale", "run"])
        );
        await expect(call).rejects.toThrow(/tailscale did not start/);
      }
      expect(emitWarning).toHaveBeenCalledTimes(1);
      const [message, options] = emitWarning.mock.calls[0]!;
      expect(options).toEqual({ type: "DeprecationWarning", code: "PROCEDURES_TAILSCALE_EXECUTABLE_INPUT" });
      expect(String(message)).toContain("createTailscaleModule({ executable })");
      expect(String(message)).toContain("TAILSCALE_EXE");
    } finally {
      emitWarning.mockRestore();
    }
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
