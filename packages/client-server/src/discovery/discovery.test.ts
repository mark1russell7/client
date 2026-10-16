/**
 * Discovery and manifests describe the registry of the caller, not the global registry (after
 * P9, a host can have its own registry; architecture review 2026-10-16).
 */

import { describe, it, expect } from "vitest";
import {
  PROCEDURE_REGISTRY,
  ProcedureRegistry,
  defineProcedure,
  invokePath,
  outputSchema,
  outputValue,
  type AnyProcedure,
} from "@procedures/client";
import { discoveryAnnounceProcedure, getProcedureInfos, watchProcedures } from "./index.js";
import { manifestGenerateProcedure } from "../procedures/manifest.generate.js";

const own = defineProcedure({
  path: ["own", "thing"],
  input: outputSchema<unknown>(),
  output: outputSchema<unknown>(),
  metadata: { description: "Only in the host's registry", effects: { reads: [], writes: [] } },
  handler: () => "thing",
}) as AnyProcedure;

function hostRegistry(): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  registry.register(discoveryAnnounceProcedure as AnyProcedure);
  registry.register(manifestGenerateProcedure as AnyProcedure);
  registry.register(own);
  return registry;
}

async function call<T>(registry: ProcedureRegistry, path: string[], input: unknown): Promise<T> {
  return (await outputValue(await invokePath(path, input, { registry }), path)) as T;
}

describe("discovery of a host with its own registry", () => {
  it("announces the procedures of the registry that serves the call", async () => {
    expect(PROCEDURE_REGISTRY.has(["own", "thing"])).toBe(false);
    const announce = await call<{ procedures: Array<{ path: string[] }> }>(hostRegistry(), ["_discovery", "announce"], {});
    expect(announce.procedures.map((p) => p.path.join("."))).toContain("own.thing");
  });

  it("generates the manifest of the caller's registry", async () => {
    const result = await call<{ json?: unknown }>(hostRegistry(), ["manifest", "generate"], { formats: ["json"] });
    expect(JSON.stringify(result.json)).toContain("Only in the host's registry");
  });

  it("describes and watches a given registry", () => {
    const registry = hostRegistry();
    expect(getProcedureInfos(registry).map((p) => p.path.join("."))).toContain("own.thing");
    const events: string[] = [];
    const stop = watchProcedures((event, info) => events.push(`${event} ${info.path.join(".")}`), registry);
    registry.unregister(["own", "thing"]);
    stop();
    registry.register(own);
    expect(events).toEqual(["unregister own.thing"]);
  });
});
