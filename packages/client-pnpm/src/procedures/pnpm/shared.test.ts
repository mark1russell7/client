/**
 * pnpm runs without a shell (deep dive WRP-5).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcedureContext } from "@mark1russell7/client";
import { pnpmAdd } from "./add.js";
import { pnpmRun } from "./run.js";
import { resolvePnpm } from "./shared.js";

const savedExecPath = process.env["npm_execpath"];
afterEach(() => {
  if (savedExecPath === undefined) delete process.env["npm_execpath"];
  else process.env["npm_execpath"] = savedExecPath;
});

/** A context whose shell.run records its input, with pnpm resolved to a fake script. */
function setup(): { ctx: ProcedureContext; call: ReturnType<typeof vi.fn>; script: string } {
  const script = join(mkdtempSync(join(tmpdir(), "pnpm-")), "pnpm.cjs");
  writeFileSync(script, "");
  process.env["npm_execpath"] = script;
  const call = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
  return { ctx: { client: { call } } as unknown as ProcedureContext, call, script };
}

describe("pnpm procedures", () => {
  it("pass a hostile package name as one argument to shell.run", async () => {
    const { ctx, call, script } = setup();
    await pnpmAdd({ packages: ["lodash & echo marker"], dev: true } as never, ctx);
    expect(call.mock.calls[0]?.[0]).toEqual(["shell", "run"]);
    const input = call.mock.calls[0]?.[1];
    expect(input.command).toBe(process.execPath);
    expect(input.args).toEqual([script, "add", "lodash & echo marker", "--save-dev"]);
  });

  it("reject a package or a script that pnpm would read as an option", async () => {
    const { ctx, call } = setup();
    await expect(pnpmAdd({ packages: ["--global"] } as never, ctx)).rejects.toThrow("starts with");
    await expect(pnpmRun({ script: "--help" } as never, ctx)).rejects.toThrow("starts with");
    expect(call).not.toHaveBeenCalled();
  });

  it("resolve pnpm from npm_execpath", () => {
    const { script } = setup();
    expect(resolvePnpm()).toEqual({ command: process.execPath, prefix: [script] });
  });
});
