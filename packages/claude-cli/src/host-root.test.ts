/**
 * The claude procedures under the root of a host (roadmap R33, tracker item O36). A root refuses
 * `claude.start`: it starts the claude program, and the agent reaches each folder. `claude.read`
 * and `claude.follow` read an output file in the root. `claude.cancel` reaches no file. Without a
 * root, nothing changes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { claudeCliModule } from "./module.js";
import type { ClaudeReadOutput } from "./types.js";

let base: string;
let root: string;
let rooted: ProcedureRegistry;

const RESULT = `${JSON.stringify({ type: "result", subtype: "success", result: "done" })}\n`;

async function read(input: unknown, at: ProcedureRegistry = rooted): Promise<ClaudeReadOutput> {
  return outputValue(await invokePath<ClaudeReadOutput>(["claude", "read"], input, { registry: at }));
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "claude-cli-host-root-"));
  root = join(base, "root");
  mkdirSync(root);
  writeFileSync(join(root, "turn.ndjson"), RESULT);
  writeFileSync(join(base, "turn.ndjson"), RESULT);
  rooted = createRegistry(claudeCliModule);
  confineToRoot(rooted, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the claude procedures under the root of a host", () => {
  it("refuse claude.start, confine claude.read and claude.follow, and leave claude.cancel as it is", () => {
    const kinds = Object.fromEntries(claudeCliModule.procedures.map((procedure) => [procedure.path.join("."), rootDecisionOf(procedure).kind]));
    expect(kinds).toEqual({ "claude.start": "refused", "claude.read": "confined", "claude.follow": "confined", "claude.cancel": "unchanged" });
    expect(rootDecisionOf(claudeCliModule.procedures[0]!).reason).toContain("home folder");
  });

  it("read an output file in the root, and refuse one outside it", async () => {
    expect(await read({ outputFile: "turn.ndjson" })).toMatchObject({ finished: true, offset: Buffer.byteLength(RESULT) });
    for (const outputFile of [join(base, "turn.ndjson"), "../turn.ndjson"]) {
      await expect(read({ outputFile })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
      await expect(invokePath(["claude", "follow"], { outputFile }, { registry: rooted })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
  });

  it("refuse claude.start before it starts a program", async () => {
    await expect(invokePath(["claude", "start"], { prompt: "hello", cwd: root, executable: process.execPath }, { registry: rooted })).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "outside-root",
    });
  });

  it("read each output file without a root", async () => {
    expect(await read({ outputFile: join(base, "turn.ndjson") }, createRegistry(claudeCliModule))).toMatchObject({ finished: true });
  });
});
