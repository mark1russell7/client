/**
 * lib.audit reports each procedure of the registry without metadata.effects (issue kind
 * missing-effects). A host with a capability refuses such a procedure. The issues are warnings:
 * they do not change success.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PURE_EFFECTS,
  createProcedure,
  createRegistry,
  defineModule,
  invokePath,
  outputSchema,
  outputValue,
  type AnyProcedure,
} from "@procedures/client";
import { libModule } from "../../module.js";
import type { LibAuditOutput } from "../../types.js";
import { findMissingEffects } from "./audit.js";

function procedure(path: string[], meta: Record<string, unknown>): AnyProcedure {
  return createProcedure()
    .path(path)
    .input(outputSchema<unknown>())
    .output(outputSchema<unknown>())
    .meta(meta)
    .handler(async () => ({}))
    .build() as unknown as AnyProcedure;
}

const message = (path: string) => `${path} has no metadata.effects: a host with a capability refuses it`;

describe("findMissingEffects", () => {
  it("reports each procedure without effects, in the order of the paths", () => {
    const issues = findMissingEffects([
      procedure(["zeta", "run"], { description: "no effects" }),
      procedure(["alpha", "read"], { effects: { reads: ["fs"], writes: [] } }),
      procedure(["alpha", "none"], {}),
      procedure(["beta", "pure"], { effects: PURE_EFFECTS }),
      procedure(["beta", "null"], { effects: null }),
    ]);
    expect(issues).toEqual([
      { type: "missing-effects", procedure: "alpha.none", message: message("alpha.none") },
      { type: "missing-effects", procedure: "beta.null", message: message("beta.null") },
      { type: "missing-effects", procedure: "zeta.run", message: message("zeta.run") },
    ]);
  });

  it("reports nothing when each procedure declares its effects", () => {
    expect(findMissingEffects([procedure(["beta", "pure"], { effects: PURE_EFFECTS })])).toEqual([]);
  });
});

describe("lib.audit and the effects of the registry", () => {
  const workspace = mkdtempSync(join(tmpdir(), "client-lib-effects-"));
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  writeFileSync(join(workspace, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
  const dir = join(workspace, "packages", "a");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@procedures/a" }));
  writeFileSync(join(dir, "tsconfig.json"), "{}");
  writeFileSync(join(dir, "dependencies.json"), JSON.stringify({ dependencies: ["ts", "node"] }));
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n");

  async function audit(...extra: AnyProcedure[]): Promise<LibAuditOutput> {
    const registry = createRegistry(libModule, defineModule("test", extra));
    return outputValue(await invokePath<LibAuditOutput>(["lib", "audit"], { rootPath: workspace }, { registry }));
  }

  it("reports a procedure of the registry without effects as a warning: success does not change", async () => {
    const result = await audit(
      procedure(["test", "undeclared"], { description: "a procedure without effects" }),
      procedure(["test", "declared"], { effects: PURE_EFFECTS })
    );
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ total: 1, valid: 1, invalid: 0 });
    expect(result.procedureIssues).toEqual([
      { type: "missing-effects", procedure: "test.undeclared", message: message("test.undeclared") },
    ]);
  });

  it("reports nothing for the procedures of @procedures/lib and the modules that it requires", async () => {
    const result = await audit();
    expect(result.procedureIssues).toEqual([]);
  });
});
