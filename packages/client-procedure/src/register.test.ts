/**
 * Importing client-procedure keeps the core procedure.list and procedure.get (docs review DOC-6).
 * Before, it replaced them with versions for the whole registry, so their results depended on
 * the imports of the host.
 */

import { describe, it, expect } from "vitest";
import { PROCEDURE_REGISTRY, invokeProcedure, outputValue } from "@mark1russell7/client";
import "./register.js";

async function run(key: string, input: unknown): Promise<unknown> {
  return outputValue(await invokeProcedure(PROCEDURE_REGISTRY.get(key.split("."))!, input));
}

describe("client-procedure and the core procedure.* introspection", () => {
  it("keeps the core procedure.list: runtime: true gives only the defined procedures", async () => {
    const listed = (await run("procedure.list", { runtime: true })) as { procedures: Array<{ runtime: boolean }> };
    expect(listed.procedures.every((p) => p.runtime)).toBe(true);
    const all = (await run("procedure.list", { namespace: "procedure" })) as { procedures: Array<{ key: string }> };
    expect(all.procedures.map((p) => p.key)).toEqual(expect.arrayContaining(["procedure.new", "procedure.export", "procedure.list"]));
  });

  it("keeps the core procedure.get, with the runtime flag", async () => {
    expect(await run("procedure.get", { path: "procedure.new" })).toMatchObject({ found: true, runtime: false });
  });
});
