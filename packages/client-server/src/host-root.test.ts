/**
 * The procedures of `@procedures/peer` under the root of a host (roadmap R33, tracker item O36).
 * `manifest.generate` writes its files in a folder of the root. The `server.*` procedures of the
 * peer and `_discovery.announce` reach no file. Without a root, nothing changes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { serverModule } from "./module.js";

let base: string;
let root: string;
let rooted: ProcedureRegistry;

async function generate(input: unknown, at: ProcedureRegistry = rooted): Promise<unknown> {
  return outputValue(await invokePath(["manifest", "generate"], input, { registry: at }));
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "peer-host-root-"));
  root = join(base, "root");
  mkdirSync(root);
  rooted = createRegistry(serverModule);
  confineToRoot(rooted, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the procedures of the peer under the root of a host", () => {
  it("confine manifest.generate, and leave the others as they are", () => {
    const kinds = Object.fromEntries(serverModule.procedures.map((procedure) => [procedure.path.join("."), rootDecisionOf(procedure).kind]));
    expect(kinds["manifest.generate"]).toBe("confined");
    const others = Object.entries(kinds).filter(([key]) => key !== "manifest.generate");
    expect(new Set(others.map(([, kind]) => kind))).toEqual(new Set(["unchanged"]));
  });

  it("write the manifest in a folder of the root, and refuse a folder outside it", async () => {
    await generate({ outputDir: "manifest" });
    expect(existsSync(join(root, "manifest", "procedures.json"))).toBe(true);
    for (const outputDir of [join(base, "manifest"), "../manifest"]) {
      await expect(generate({ outputDir })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
    expect(existsSync(join(base, "manifest"))).toBe(false);
    // Without outputDir, it writes no file
    await generate({});
  });

  it("write the manifest in each folder without a root", async () => {
    await generate({ outputDir: join(base, "manifest") }, createRegistry(serverModule));
    expect(existsSync(join(base, "manifest", "procedures.json"))).toBe(true);
  });
});
