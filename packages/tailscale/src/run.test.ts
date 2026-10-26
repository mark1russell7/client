/**
 * The argv, the JSON and the login address of tailscale.run, with a fake runCommand: no program starts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistry, invokePath, outputValue } from "@procedures/client";

const runCommand = vi.hoisted(() => vi.fn());
vi.mock("@procedures/shell/command", () => ({ runCommand }));

const { createTailscaleModule, registerTailscaleProcedures } = await import("./module.js");
const { buildArgv, FLAG_NAME } = await import("./argv.js");

function result(fields: { exitCode?: number; stdout?: string; stderr?: string }) {
  const exitCode = fields.exitCode ?? 0;
  return { exitCode, stdout: fields.stdout ?? "", stderr: fields.stderr ?? "", success: exitCode === 0, duration: 1 };
}

beforeEach(() => {
  runCommand.mockReset();
});

describe("tailscale.run with a fake runCommand", () => {
  it("builds the argv, reads the JSON and gives the program of the host", async () => {
    runCommand.mockResolvedValue(result({ stdout: '{"Self":{"Online":true}}' }));
    const registry = createRegistry(createTailscaleModule({ executable: "/opt/ts" }));
    const output = await outputValue(
      await invokePath(["tailscale", "run"], { path: ["serve", "status"], json: true, args: { bg: true }, positional: ["-x"] }, { registry }),
    );
    expect(output).toEqual({ exitCode: 0, success: true, stdout: '{"Self":{"Online":true}}', stderr: "", json: { Self: { Online: true } } });
    expect(runCommand).toHaveBeenCalledWith("/opt/ts", expect.objectContaining({ args: ["serve", "status", "--json", "--bg", "--", "-x"], timeout: 60_000 }));
  });

  it("gives the login address and the failed exit code, with no JSON when it was not asked for", async () => {
    runCommand.mockResolvedValue(result({ exitCode: 1, stderr: "To authenticate, visit:\n\thttps://login.tailscale.com/a/abc123\n" }));
    const registry = createRegistry();
    registerTailscaleProcedures(registry);
    const output = await outputValue(await invokePath(["tailscale", "run"], { path: ["up"] }, { registry }));
    expect(output).toMatchObject({ exitCode: 1, success: false, actionUrl: "https://login.tailscale.com/a/abc123" });
    expect(output).not.toHaveProperty("json");
  });

  it("re-exports the argv helpers of @procedures/shell/cli", () => {
    expect(buildArgv({ path: ["ip"], args: { "accept-routes": true } })).toEqual(["ip", "--accept-routes"]);
    expect(FLAG_NAME.test("accept-routes")).toBe(true);
  });
});
