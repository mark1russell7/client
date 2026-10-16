/**
 * One manifest type (roadmap R17): `describeRegistry`, and the introspection procedures under the
 * expose rule of a host.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createProcedure } from "./define.js";
import { createRegistry } from "./module.js";
import { MANIFEST_FORMAT, describeRegistry } from "./manifest.js";
import { ProcedureServer } from "../server/procedure-server.js";
import { pathToMethod } from "../server/method.js";
import type { ServerResponse } from "../server/types.js";
import { metaProcedures } from "./core/meta.js";

function registry() {
  return createRegistry({
    name: "shop",
    procedures: [
      createProcedure()
        .path(["shop", "price"])
        .input(z.object({ item: z.string() }))
        .output(z.number())
        .meta({ description: "The price of an item", tags: ["shop"], effects: { reads: ["prices"], writes: [] }, args: ["item"], output: "json" })
        .handler(async () => 1)
        .build(),
      createProcedure()
        .path(["admin", "wipe"])
        .input(z.object({}))
        .output(z.boolean())
        .meta({ description: "Delete everything", effects: { writes: ["prices"] } })
        .handler(async () => true)
        .build(),
    ],
  });
}

describe("describeRegistry (R17)", () => {
  it("describes each procedure with its schemas, effects and command-line metadata, in the order of the keys", () => {
    const manifest = describeRegistry(registry(), { include: (procedure) => ["shop", "admin"].includes(procedure.path[0]!) });
    expect(manifest.format).toBe(MANIFEST_FORMAT);
    expect(manifest.procedures.map((entry) => entry.key)).toEqual(["admin.wipe", "shop.price"]);
    const price = manifest.procedures[1]!;
    expect(price).toMatchObject({
      description: "The price of an item",
      tags: ["shop"],
      effects: { reads: ["prices"], writes: [] },
      cli: { args: ["item"], output: "json" },
      dataDriven: false,
      runtime: false,
      hasHandler: true,
    });
    expect(price.input).toMatchObject({ type: "object", properties: { item: { type: "string" } } });
    expect(price.output).toMatchObject({ type: "number" });
  });

  it("obeys the expose rule, and the hash changes with the procedures", () => {
    const all = describeRegistry(registry());
    const shopOnly = describeRegistry(registry(), { expose: (path) => path[0] === "shop" });
    expect(shopOnly.procedures.map((entry) => entry.key)).toEqual(["shop.price"]);
    expect(shopOnly.hash).not.toBe(all.hash);
    expect(describeRegistry(registry()).hash).toBe(all.hash);
  });
});

describe("the introspection procedures under the expose rule of a host (R17)", () => {
  function server() {
    const reg = registry();
    const host = new ProcedureServer({ registry: reg, expose: (path) => path[0] !== "admin" });
    host.registerFromRegistry();
    const call = (path: string[], payload: unknown): Promise<ServerResponse> =>
      host.handle({ id: "1", method: pathToMethod(path), payload, metadata: {} });
    return call;
  }

  it("procedure.get gives the schemas and the effects, and does not find a hidden procedure", async () => {
    const call = server();
    const found = (await call(["procedure", "get"], { path: "shop.price" })).payload as Record<string, unknown>;
    expect(found).toMatchObject({ found: true, effects: { reads: ["prices"], writes: [] } });
    expect(found["input"]).toMatchObject({ type: "object" });
    expect((await call(["procedure", "get"], { path: "admin.wipe" })).payload).toEqual({ found: false });
  });

  it("procedure.list and procedure.manifest leave out the hidden procedures", async () => {
    const call = server();
    const list = (await call(["procedure", "list"], {})).payload as { procedures: Array<{ key: string }> };
    expect(list.procedures.some((entry) => entry.key === "admin.wipe")).toBe(false);
    expect(list.procedures.some((entry) => entry.key === "shop.price")).toBe(true);
    const manifest = (await call(["procedure", "manifest"], { namespace: "shop" })).payload as { format: string; procedures: Array<{ key: string }> };
    expect(manifest.format).toBe(MANIFEST_FORMAT);
    expect(manifest.procedures.map((entry) => entry.key)).toEqual(["shop.price"]);
  });

  it("client.lookup does not find a hidden procedure", async () => {
    // client.lookup is an opt-in core operator: its handler with the context of a host
    const lookup = metaProcedures.find((procedure) => procedure.path.join(".") === "client.lookup")!;
    const ctx = { registry: registry(), expose: (path: string[]) => path[0] !== "admin" } as never;
    expect(((await lookup.handler!({ path: ["admin", "wipe"] }, ctx)) as { exists: boolean }).exists).toBe(false);
    expect(((await lookup.handler!({ path: ["shop", "price"] }, ctx)) as { exists: boolean }).exists).toBe(true);
  });
});
