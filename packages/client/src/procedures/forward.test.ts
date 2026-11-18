/**
 * The stubs of a manifest (d40-tool-surface, step 2): `forwardedModule` makes a stub for each entry
 * of the manifest of a peer, and each stub sends its call through the call function.
 */

import { describe, expect, it } from "vitest";
import * as z from "zod";
import { createRegistry } from "./module.js";
import { describeRegistry } from "./manifest.js";
import { jsonSchemaOf } from "./schema.js";
import { HOST_NAMESPACES, forwardedModule, type ForwardCall } from "./forward.js";
import type { AnyProcedure, ProcedurePath } from "./types.js";

const reads = { reads: ["jobs"], writes: [] };

/** The registry of a peer: two namespaces, a stream without an end and a procedure without a handler. */
function peerRegistry() {
  const procedures: AnyProcedure[] = [
    {
      path: ["jobs", "add"],
      input: z.object({ name: z.string() }),
      output: z.object({ count: z.number() }),
      metadata: { description: "This procedure adds a job.", tags: ["jobs"], effects: { reads: ["jobs"], writes: ["jobs"] }, args: ["name"], deprecated: true },
      handler: async () => ({ count: 1 }),
    },
    { path: ["jobs", "watch"], input: z.object({}), output: z.number(), metadata: { effects: reads, stream: { unbounded: true } }, handler: async () => 0 },
    { path: ["jobs", "stub"], input: z.object({}), output: z.number(), metadata: { effects: reads } },
    { path: ["notes", "get"], input: z.object({ id: z.string() }), output: z.string(), metadata: { effects: reads }, handler: async () => "" },
  ] as AnyProcedure[];
  return createRegistry({ name: "peer", procedures });
}

const manifest = describeRegistry(peerRegistry(), { withoutHandler: true });
const keys = (procedures: readonly AnyProcedure[]): string[] => procedures.map((procedure) => procedure.path.join("."));

describe("forwardedModule", () => {
  it("forwards each namespace of the peer except the namespaces of each host", () => {
    expect(manifest.procedures.some((entry) => HOST_NAMESPACES.includes(entry.path[0]!))).toBe(true);
    const module = forwardedModule(manifest, async () => null, { name: "peer" });
    expect(module.name).toBe("peer");
    expect(keys(module.procedures)).toEqual(["jobs.add", "notes.get"]);
  });

  it("leaves out a stream without an end and an entry without a handler", () => {
    expect(manifest.procedures.map((entry) => entry.key)).toEqual(expect.arrayContaining(["jobs.watch", "jobs.stub"]));
    const module = forwardedModule(manifest, async () => null, { name: "peer", namespaces: ["jobs"] });
    expect(keys(module.procedures)).toEqual(["jobs.add"]);
  });

  it("forwards only the namespaces that the options name, also a namespace of each host", () => {
    expect(keys(forwardedModule(manifest, async () => null, { name: "peer", namespaces: ["notes"] }).procedures)).toEqual(["notes.get"]);
    const meta = forwardedModule(manifest, async () => null, { name: "peer", namespaces: ["procedure"] });
    expect(keys(meta.procedures)).toContain("procedure.manifest");
  });

  it("gives each stub the description, the schemas, the effects and the command-line metadata of its entry", () => {
    const [add] = forwardedModule(manifest, async () => null, { name: "peer", namespaces: ["jobs"] }).procedures;
    const entry = manifest.procedures.find((item) => item.key === "jobs.add")!;
    expect(add!.metadata).toMatchObject({
      description: "This procedure adds a job.",
      tags: ["jobs"],
      effects: { reads: ["jobs"], writes: ["jobs"] },
      args: ["name"],
      deprecated: true,
      forwarded: "jobs.add",
    });
    expect(jsonSchemaOf(add!.input)).toEqual(entry.input);
    expect(jsonSchemaOf(add!.output, { io: "output" })).toEqual(entry.output);
  });

  it("puts the prefix in front of each local path, and sends the call to the path of the entry", async () => {
    const calls: { path: ProcedurePath; input: unknown; signal: AbortSignal | undefined }[] = [];
    const call: ForwardCall = async (path, input, signal) => {
      calls.push({ path, input, signal });
      return { count: 7 };
    };
    const [add] = forwardedModule(manifest, call, { name: "peer", namespaces: ["jobs"], prefix: ["peer"] }).procedures;
    expect(add!.path).toEqual(["peer", "jobs", "add"]);
    const signal = new AbortController().signal;
    // The schema of the stub accepts each input: the peer examines it
    expect((add!.input as { "~standard": { validate: (value: unknown) => unknown } })["~standard"].validate({ name: 7 })).toEqual({ value: { name: 7 } });
    await expect(add!.handler!({ name: 7 }, { metadata: {}, signal } as never)).resolves.toEqual({ count: 7 });
    expect(calls).toEqual([{ path: ["jobs", "add"], input: { name: 7 }, signal }]);
  });
});
