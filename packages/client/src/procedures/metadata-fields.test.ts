/**
 * The schema of the typed metadata fields (`metadata-fields.ts`), and the refusal of the registry
 * for a typed field with a wrong type. A custom field keeps any value.
 */

import { describe, expect, it } from "vitest";
import type { LogFields, Logger, LogLevel } from "../logger.js";
import { outputSchema } from "./core/schemas.js";
import { defineProcedure } from "./define.js";
import { metadataFieldProblems, metadataFieldRefusal } from "./metadata-fields.js";
import { ProcedureRegistry, RegistryError } from "./registry.js";
import type { AnyProcedure } from "./types.js";

describe("metadataFieldProblems and metadataFieldRefusal", () => {
  it.each([
    [undefined],
    [{}],
    [{ description: "Add one", tags: ["math"], title: "Add", deprecated: false, deprecationMessage: "Use add2" }],
    [{ effects: { reads: [], writes: ["fs"], idempotent: true, destructive: false } }],
    [{ stream: { unbounded: true }, untrusted: ["body"], fsRoot: { cwd: "cwd", paths: ["path"], refuse: "no root" } }],
    [{ description: undefined, tags: undefined }],
    [{ note: 7, custom: { any: ["value"] } }],
  ])("accepts the metadata %j", (metadata) => {
    expect(metadataFieldProblems(metadata)).toEqual([]);
    expect(metadataFieldRefusal(metadata)).toBeUndefined();
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
    [{ fsRoot: { paths: "path" } }, "metadata.fsRoot.paths", "metadata.fsRoot", "an object: cwd and refuse are strings, paths, names, required and values are lists of strings, program is a boolean"],
    ["text", "metadata", "metadata", "an object"],
  ])("refuses the metadata %j at %s", (metadata, field, typedField, needs) => {
    expect(metadataFieldProblems(metadata)).toEqual([{ field, typedField, needs, message: expect.any(String) }]);
    const refusal = metadataFieldRefusal(metadata);
    expect(refusal).toContain(`The field ${field} has a wrong type`);
    expect(refusal).toContain(`The field ${typedField} needs ${needs}.`);
  });

  it("gives one problem for each wrong field, and the refusal names the first", () => {
    const metadata = { tags: "math", description: 5, note: "custom" };
    const fields = metadataFieldProblems(metadata).map((problem) => problem.field);
    expect([...fields].sort()).toEqual(["metadata.description", "metadata.tags"]);
    expect(metadataFieldRefusal(metadata)).toContain(`The field ${String(fields[0])} has a wrong type`);
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

describe("the registry and the typed metadata fields", () => {
  it("refuses a typed field with a wrong type, and names the procedure, the field and its type", () => {
    const registry = new ProcedureRegistry();
    const register = (): void => registry.register(procedureWith(["test", "add"], { tags: "math" }));
    expect(register).toThrow(RegistryError);
    expect(register).toThrow("The field metadata.tags has a wrong type");
    expect(register).toThrow("The field metadata.tags needs a list of strings. (test.add)");
    expect(registry.has(["test", "add"])).toBe(false);
  });

  it("refuses an override with a wrong type, and keeps the procedure that it replaces", () => {
    const registry = new ProcedureRegistry();
    const good = procedureWith(["test", "add"], { tags: ["math"] });
    registry.register(good);
    expect(() => registry.register(procedureWith(["test", "add"], { description: 5 }), { override: true })).toThrow("metadata.description");
    expect(registry.get(["test", "add"])?.metadata).toEqual({ tags: ["math"] });
  });

  it("registers metadata with the correct types and custom fields", () => {
    const registry = new ProcedureRegistry();
    registry.register(procedureWith(["test", "good"], { description: "Add one", tags: ["math"], note: 7 }));
    registry.register(procedureWith(["test", "bare"], undefined));
    expect(registry.has(["test", "good"])).toBe(true);
    expect(registry.has(["test", "bare"])).toBe(true);
  });

  it("gives the error of a listener to the logger, and the registration works", () => {
    const logger = memoryLogger();
    const registry = new ProcedureRegistry({ logger });
    registry.on("register", () => {
      throw new Error("the listener broke");
    });
    registry.register(procedureWith(["test", "add"], { tags: ["math"] }));
    expect(registry.has(["test", "add"])).toBe(true);
    expect(logger.lines).toHaveLength(1);
    const [line] = logger.lines;
    expect(line?.level).toBe("error");
    expect(line?.message).toBe("Registry listener error for register: the listener broke");
    expect(line?.fields["event"]).toBe("register");
    expect(line?.fields["error"]).toBeInstanceOf(Error);
  });
});
