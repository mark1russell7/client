/**
 * The argv, the JSON and the login address of tailscale.run, with the fake shell of
 * `@procedures/shell/testing`: no program starts.
 */

import { describe, expect, it } from "vitest";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { fakeShell } from "@procedures/shell/testing";
import { createTailscaleModule, registerTailscaleProcedures, tailscaleModule } from "./module.js";
import { buildArgv, FLAG_NAME } from "./argv.js";

describe("tailscale.run with the fake shell", () => {
  it("builds the argv, reads the JSON and gives the program of the host", async () => {
    const shell = fakeShell({ stdout: '{"Self":{"Online":true}}' });
    const registry = createRegistry(shell.module, createTailscaleModule({ executable: "/opt/ts" }));
    const output = await outputValue(
      await invokePath(["tailscale", "run"], { path: ["serve", "status"], json: true, args: { bg: true }, positional: ["-x"] }, { registry }),
    );
    expect(output).toEqual({ exitCode: 0, success: true, stdout: '{"Self":{"Online":true}}', stderr: "", json: { Self: { Online: true } } });
    expect(shell.calls).toHaveLength(1);
    expect(shell.calls[0]).toMatchObject({ command: "/opt/ts", args: ["serve", "status", "--json", "--bg", "--", "-x"], timeout: 60_000 });
  });

  it("gives the login address and the failed exit code, with no JSON when it was not asked for", async () => {
    const shell = fakeShell({ exitCode: 1, stderr: "To authenticate, visit:\n\thttps://login.tailscale.com/a/abc123\n" });
    const registry = createRegistry(shell.module, tailscaleModule);
    const output = await outputValue(await invokePath(["tailscale", "run"], { path: ["up"] }, { registry }));
    expect(output).toMatchObject({ exitCode: 1, success: false, actionUrl: "https://login.tailscale.com/a/abc123" });
    expect(output).not.toHaveProperty("json");
  });

  it("throws when shell.run tells that the program did not start", async () => {
    const shell = fakeShell({ exitCode: 1, stderr: "spawn /opt/ts ENOENT" });
    const registry = createRegistry(shell.module, createTailscaleModule({ executable: "/opt/ts" }));
    const call = invokePath(["tailscale", "run"], { path: ["status"] }, { registry }).then((output) => outputValue(output, ["tailscale", "run"]));
    await expect(call).rejects.toThrow("tailscale did not start: spawn /opt/ts ENOENT");
  });

  it("registers the shell procedures that it calls", () => {
    const registry = createRegistry();
    registerTailscaleProcedures(registry);
    expect(registry.has(["tailscale", "run"])).toBe(true);
    expect(registry.has(["shell", "run"])).toBe(true);
  });

  it("re-exports the argv helpers of @procedures/shell/cli", () => {
    expect(buildArgv({ path: ["ip"], args: { "accept-routes": true } })).toEqual(["ip", "--accept-routes"]);
    expect(FLAG_NAME.test("accept-routes")).toBe(true);
  });
});
