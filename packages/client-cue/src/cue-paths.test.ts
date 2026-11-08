/**
 * These tests examine the other paths of the `cue.*` tools: an unknown name, a file that exists and
 * a feature that is present or absent. They also examine the two forms of `dependencies.json` and a
 * failed write. The tests call the tools through the registry, in a temporary project.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, LocalTransport, PROCEDURE_REGISTRY, type ProcedureContext } from "@procedures/client";
import "./register.js";
import { cueAdd } from "./procedures/cue/add.js";
import { cueInit } from "./procedures/cue/init.js";
import { cueRemove } from "./procedures/cue/remove.js";
import type { CueAddOutput, CueInitOutput, CueRemoveOutput, CueValidateOutput } from "./types.js";

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

function call<T>(operation: string, input: unknown): Promise<T> {
  return client.call<unknown, T>({ service: "cue", operation }, input);
}

const project = () => mkdtempSync(join(tmpdir(), "client-cue-paths-"));

/** This context sends each call of a path to the registry, but a call of `fs.write` fails. */
const failedWrite = {
  client: {
    call: (path: unknown, input: unknown) =>
      Array.isArray(path) && path[0] === "fs" && path[1] === "write"
        ? Promise.reject(new Error("disk full"))
        : client.call({ service: String((path as string[])[0]), operation: (path as string[]).slice(1).join(".") }, input),
  },
} as unknown as ProcedureContext;

describe("cue.init", () => {
  it("refuses an unknown preset and names the presets", async () => {
    const result = await call<CueInitOutput>("init", { cwd: project(), preset: "no-such-preset" });
    expect(result).toMatchObject({ success: false, created: [], error: expect.stringMatching(/Unknown preset: no-such-preset\. Available: .*lib/) });
  });

  it("keeps a dependencies.json that exists, and writes it again with force", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "dependencies.json"), '["ts"]');
    const kept = await call<CueInitOutput>("init", { cwd, preset: "lib" });
    expect(kept).toMatchObject({ success: true, created: [], message: expect.stringMatching(/already exists/) });
    expect(readFileSync(join(cwd, "dependencies.json"), "utf8")).toBe('["ts"]');
    const forced = await call<CueInitOutput>("init", { cwd, preset: "lib", force: true });
    expect(forced.success).toBe(true);
    expect(forced.created).toContain("dependencies.json");
    expect(readFileSync(join(cwd, "dependencies.json"), "utf8")).not.toBe('["ts"]');
  }, 60_000);

  it("reports a failed write", async () => {
    const result = await cueInit({ cwd: project(), preset: "lib", force: false }, failedWrite);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("cue.add and cue.remove", () => {
  it("add does not add a feature that is present, and remove does not remove one that is absent", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "dependencies.json"), '{"dependencies": ["ts"]}');
    const added = await call<CueAddOutput>("add", { cwd, feature: "ts" });
    expect(added).toMatchObject({ success: true, added: false, message: expect.stringMatching(/already in dependencies/) });
    const removed = await call<CueRemoveOutput>("remove", { cwd, feature: "node" });
    expect(removed).toMatchObject({ success: true, removed: false, message: expect.stringMatching(/not in dependencies/) });
  });

  it("remove reports a missing dependencies.json", async () => {
    const removed = await call<CueRemoveOutput>("remove", { cwd: project(), feature: "ts" });
    expect(removed).toMatchObject({ success: false, removed: false, error: expect.stringMatching(/No dependencies\.json found/) });
  });

  it("add and remove report a failed write, and the file does not change", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "dependencies.json"), '["ts"]');
    const added = await cueAdd({ cwd, feature: "node" }, failedWrite);
    expect(added).toMatchObject({ success: false, added: false, error: "Failed to write dependencies.json" });
    const removed = await cueRemove({ cwd, feature: "ts" }, failedWrite);
    expect(removed).toMatchObject({ success: false, removed: false, error: "Failed to write dependencies.json" });
    expect(readFileSync(join(cwd, "dependencies.json"), "utf8")).toBe('["ts"]');
  });
});

describe("cue.validate", () => {
  it("reads a dependencies.json that is a plain list, and names each unknown feature", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "dependencies.json"), '["ts", "no-such-feature"]');
    const result = await call<CueValidateOutput>("validate", { cwd });
    expect(result).toMatchObject({ success: true, valid: false, features: ["ts", "no-such-feature"], errors: ["Unknown feature: 'no-such-feature'"] });
  });

  it("treats an object without a dependencies list as a missing file", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "dependencies.json"), '{"other": 1}');
    const result = await call<CueValidateOutput>("validate", { cwd });
    expect(result).toMatchObject({ success: false, errors: ["No dependencies.json found. Run cue.init first."] });
  });
});
