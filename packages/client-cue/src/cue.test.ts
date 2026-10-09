/**
 * The cue.* tools, called through the registry as the MCP server calls them, in a temporary
 * project. A tool that cannot work fails here (the deep dive found every cue.* tool broken over
 * MCP: WRP-3). The other tests check that a failed file operation is an error, not the message
 * "No dependencies.json found", and that cue runs through `runCommand` (roadmap 2.2).
 */

import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, LocalTransport, PROCEDURE_REGISTRY, type ProcedureContext } from "@mark1russell7/client";
import "./register.js";
import { cueValidate } from "./procedures/cue/validate.js";
import { checkCue } from "./shared.js";
import type { CueAddOutput, CueGenerateOutput, CueInitOutput, CueRemoveOutput, CueValidateOutput } from "./types.js";

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

function call<T>(operation: string, input: unknown): Promise<T> {
  return client.call<unknown, T>({ service: "cue", operation }, input);
}

describe("cue tools through the registry", () => {
  it("init, validate, add, remove and generate a project", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "client-cue-"));

    const init = await call<CueInitOutput>("init", { cwd, preset: "lib" });
    expect(init.success).toBe(true);
    expect(init.created).toContain("dependencies.json");

    // Every preset has "vitest", but the schema of the general cue package (schema.cue) does
    // not list it yet, so `cue vet` rejects it. Remove it before the validation.
    const removed = await call<CueRemoveOutput>("remove", { cwd, feature: "vitest" });
    expect(removed).toMatchObject({ success: true, removed: true });

    const added = await call<CueAddOutput>("add", { cwd, feature: "node" });
    expect(added).toMatchObject({ success: true, added: true });
    expect(readFileSync(join(cwd, "dependencies.json"), "utf8")).toContain('"node"');

    const valid = await call<CueValidateOutput>("validate", { cwd });
    expect(valid).toMatchObject({ success: true, valid: true });

    const generated = await call<CueGenerateOutput>("generate", { cwd });
    if (await checkCue()) {
      expect(generated.error).toBeUndefined();
      expect(generated.success).toBe(true);
      expect(existsSync(join(cwd, "package.json"))).toBe(true);
    } else {
      // Without the cue program (as on CI), the tool says so
      expect(generated).toMatchObject({ success: false, error: expect.stringMatching(/CUE is not installed/) });
    }
  }, 60_000);
});

describe("cue file errors", () => {
  it("report a failed file operation, not a missing file", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "client-cue-"));
    writeFileSync(join(cwd, "dependencies.json"), '{"dependencies": ["ts"]}');
    // A host where the fs.* procedures are missing
    const ctx = {
      client: { call: () => Promise.reject(new Error("No handler registered for fs.exists")) },
    } as unknown as ProcedureContext;
    await expect(cueValidate({ cwd }, ctx)).rejects.toThrow(/No handler registered/);
  });

  it("report a dependencies.json that is not JSON", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "client-cue-"));
    writeFileSync(join(cwd, "dependencies.json"), "{ not json");
    await expect(call("validate", { cwd })).rejects.toThrow(/not valid JSON/);
  });

  it("report a missing dependencies.json", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "client-cue-"));
    const result = await call<CueValidateOutput>("validate", { cwd });
    expect(result).toMatchObject({ success: false, errors: ["No dependencies.json found. Run cue.init first."] });
  });
});
