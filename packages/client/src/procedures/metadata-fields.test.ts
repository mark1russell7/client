/**
 * The schema of the typed metadata fields (`metadata-fields.ts`), and the warning of the registry
 * for a typed field with a wrong type. The procedure stays in the registry and its call works.
 */

import { describe, expect, it } from "vitest";
import { Client } from "../client/client.js";
import type { LogFields, Logger, LogLevel } from "../logger.js";
import { outputSchema } from "./core/schemas.js";
import { defineProcedure } from "./define.js";
import { metadataFieldProblems } from "./metadata-fields.js";
import { ProcedureRegistry } from "./registry.js";
import type { AnyProcedure } from "./types.js";

describe("metadataFieldProblems", () => {
  it.each([
    [undefined],
    [{}],
    [{ description: "Add one", tags: ["math"], title: "Add", deprecated: false, deprecationMessage: "Use add2" }],
    [{ effects: { reads: [], writes: ["fs"], idempotent: true, destructive: false } }],
    [{ stream: { unbounded: true }, untrusted: ["body"], fsRoot: { cwd: "cwd", paths: ["path"], refuse: "no root" } }],
    [{ description: undefined, tags: undefined }],
    [{ note: 7, custom: { any: ["value"] } }],
  ])("finds no problem in the metadata %j", (metadata) => {
    expect(metadataFieldProblems(metadata)).toEqual([]);
  });

  it.each([
    [{ tags: "math" }, "metadata.tags", "metadata.tags", "a list of strings"],
    [{ tags: ["math", 1] }, "metadata.tags[1]", "metadata.tags", "a list of strings"],
    [{ description: 5 }, "metadata.description", "metadata.description", "a string"],
    [{ title: ["x"] }, "metadata.title", "metadata.title", "a string"],
    [{ deprecated: "yes" }, "metadata.deprecated", "metadata.deprecated", "a boolean"],
    [{ effects: { writes: "fs" } }, "metadata.effects.writes", "metadata.effects", "an object: reads and writes are lists of strings, idempotent and destructive are booleans"],
    [{ stream: true }, "metadata.stream", "metadata.stream", "an object: unbounded is a boolean"],
    [{ untrusted: "body" }, "metadata.untrusted", "metadata.untrusted", "a list of strings"],
    [{ fsRoot: { paths: "path" } }, "metadata.fsRoot.paths", "metadata.fsRoot", expect.stringContaining("paths, names, required and values are lists of strings")],
    ["text", "metadata", "metadata", "an object"],
  ])("finds the problem of the metadata %j at %s", (metadata, field, typedField, needs) => {
    expect(metadataFieldProblems(metadata)).toEqual([{ field, typedField, needs, message: expect.any(String) }]);
  });

  it("gives one problem for each wrong field", () => {
    const fields = metadataFieldProblems({ tags: "math", description: 5, note: "custom" }).map((problem) => problem.field);
    expect(fields.sort()).toEqual(["metadata.description", "metadata.tags"]);
  });
});

/** A logger that keeps each line in memory. */
function memoryLogger(): Logger & { readonly lines: { level: LogLevel; message: string; fields: LogFields }[] } {
  const lines: { level: LogLevel; message: string; fields: LogFields }[] = [];
  return { lines, log: (level, message, fields) => void lines.push({ level, message, fields }) };
}

/** A procedure at a path with the metadata of the test, which can have a wrong type. */
function procedureWith(path: string[], metadata: unknown): AnyProcedure {
  const procedure = defineProcedure({
    path,
    input: outputSchema<{ n: number }>(),
    output: outputSchema<{ n: number }>(),
    handler: (input: { n: number }) => ({ n: input.n + 1 }),
  });
  return { ...procedure, metadata } as unknown as AnyProcedure;
}

/** A client that runs the procedures of a registry in process. The transport is not used. */
function clientOf(registry: ProcedureRegistry): Client {
  const stubTransport = { send: async function* () {} } as unknown as ConstructorParameters<typeof Client>[0];
  return new Client(stubTransport).useRegistry(registry);
}

describe("the warning of the registry for a typed metadata field with a wrong type", () => {
  it("warns one time through the logger, and the call of the procedure works", async () => {
    const logger = memoryLogger();
    const registry = new ProcedureRegistry({ logger });
    registry.register(procedureWith(["test", "add"], { tags: "math" }));
    registry.register(procedureWith(["test", "add"], { tags: "math" }), { override: true });

    expect(logger.lines).toHaveLength(1);
    const [line] = logger.lines;
    expect(line?.level).toBe("warn");
    expect(line?.message).toContain("The procedure test.add has the field metadata.tags with a wrong type");
    expect(line?.message).toContain("The field metadata.tags needs a list of strings");
    expect(line?.message).toContain("0.60.0 refuses this");
    expect(line?.fields).toEqual({ procedure: "test.add", field: "metadata.tags", needs: "a list of strings" });

    expect(registry.has(["test", "add"])).toBe(true);
    await expect(clientOf(registry).exec(["test", "add"], { n: 1 })).resolves.toEqual({ n: 2 });
  });

  it("warns one time for each field and procedure", () => {
    const logger = memoryLogger();
    const registry = new ProcedureRegistry({ logger });
    registry.register(procedureWith(["test", "a"], { tags: "math", description: 5 }));
    registry.register(procedureWith(["test", "b"], { tags: "math" }));
    const pairs = logger.lines.map((line) => `${String(line.fields["procedure"])} ${String(line.fields["field"])}`);
    expect(pairs.sort()).toEqual(["test.a metadata.description", "test.a metadata.tags", "test.b metadata.tags"]);
  });

  it("gives no warning for metadata with the correct types and custom fields", () => {
    const logger = memoryLogger();
    const registry = new ProcedureRegistry({ logger });
    registry.register(procedureWith(["test", "good"], { description: "Add one", tags: ["math"], note: 7 }));
    registry.register(procedureWith(["test", "bare"], undefined));
    expect(logger.lines).toEqual([]);
  });
});
