/**
 * The procedures of @procedures/json through a registry (roadmap R39): each procedure, the pure
 * effects, the refusal of the prototype keys (roadmap R6), and the refusal of values that are not
 * JSON. The inputs come from `JSON.parse`, as from a transport, so a key `__proto__` is an own key.
 */

import { describe, expect, it } from "vitest";
import { PURE_EFFECTS, createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { jsonModule, registerJsonProcedures } from "./module.js";
import type { JsonDiffOutput, JsonMergeOutput, JsonPatchOutput, JsonQueryOutput, JsonValidateOutput, YamlParseOutput, YamlStringifyOutput } from "./types.js";

const registry: ProcedureRegistry = createRegistry(jsonModule);

async function call<T>(key: string, input: unknown): Promise<T> {
  const path = key.split(".");
  return outputValue(await invokePath<T>(path, input, { registry }), path);
}

/** An input as a transport gives it: parsed from JSON text. */
const wire = (text: string): unknown => JSON.parse(text) as unknown;

async function failure(promise: Promise<unknown>): Promise<Error> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(Error);
  return error as Error;
}

describe("the module", () => {
  it("has seven pure procedures", () => {
    const keys = jsonModule.procedures.map((procedure) => procedure.path.join("."));
    expect(keys).toEqual(["json.query", "json.patch", "json.diff", "json.merge", "json.validate", "yaml.parse", "yaml.stringify"]);
    for (const procedure of jsonModule.procedures) {
      expect((procedure.metadata as { effects?: unknown }).effects, procedure.path.join(".")).toBe(PURE_EFFECTS);
    }
    const global = createRegistry();
    registerJsonProcedures(global);
    expect(global.get(["yaml", "parse"])).toBeDefined();
  });
});

describe("json.query", () => {
  const value = { items: [{ id: 1 }, { id: 2 }], "a/b": true };

  it("gives the value at a pointer, or found: false", async () => {
    expect(await call<JsonQueryOutput>("json.query", { value, pointer: "/items/1/id" })).toEqual({ found: true, value: 2, matches: [{ pointer: "/items/1/id", value: 2 }] });
    expect(await call<JsonQueryOutput>("json.query", { value, pointer: "/a~1b" })).toMatchObject({ found: true, value: true });
    expect(await call<JsonQueryOutput>("json.query", { value, pointer: "/items/5" })).toEqual({ found: false, matches: [] });
    expect(await call<JsonQueryOutput>("json.query", { value: null, pointer: "" })).toEqual({ found: true, value: null, matches: [{ pointer: "", value: null }] });
  });

  it("gives each match of a path", async () => {
    expect(await call<JsonQueryOutput>("json.query", { value, path: "items[*].id" })).toEqual({
      found: true,
      value: 1,
      matches: [
        { pointer: "/items/0/id", value: 1 },
        { pointer: "/items/1/id", value: 2 },
      ],
    });
    expect(await call<JsonQueryOutput>("json.query", { value, path: "$..missing" })).toEqual({ found: false, matches: [] });
  });

  it("refuses the prototype keys, and an input with both or none of pointer and path", async () => {
    expect(await failure(call("json.query", { value, pointer: "/__proto__/polluted" }))).toMatchObject({ code: "PROTOTYPE_KEY" });
    expect(await failure(call("json.query", { value, path: "items.constructor" }))).toMatchObject({ code: "PROTOTYPE_KEY" });
    expect(await failure(call("json.query", { value, pointer: "", path: "$" }))).toMatchObject({ code: "INVALID_POINTER" });
    expect(await failure(call("json.query", { value }))).toMatchObject({ code: "INVALID_POINTER" });
  });
});

describe("json.patch, json.diff and json.merge", () => {
  it("applies a patch", async () => {
    const result = await call<JsonPatchOutput>("json.patch", {
      value: { a: [1] },
      patch: [
        { op: "add", path: "/a/-", value: 2 },
        { op: "add", path: "/b", value: { c: null } },
        { op: "test", path: "/a", value: [1, 2] },
      ],
    });
    expect(result.value).toEqual({ a: [1, 2], b: { c: null } });
  });

  it("refuses a patch to a prototype key from the wire, and does not change Object.prototype", async () => {
    const error = await failure(call("json.patch", wire('{"value":{},"patch":[{"op":"add","path":"/__proto__/polluted","value":true}]}')));
    expect(error).toMatchObject({ code: "PROTOTYPE_KEY" });
    expect(await failure(call("json.patch", wire('{"value":{"a":{}},"patch":[{"op":"move","from":"/a","path":"/constructor"}]}')))).toMatchObject({ code: "PROTOTYPE_KEY" });
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("refuses an unknown operation in the schema", async () => {
    expect(await failure(call("json.patch", { value: {}, patch: [{ op: "merge", path: "" }] }))).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("gives a diff that json.patch applies", async () => {
    const from = { a: 1, list: [1, 2, 3], nested: { x: "y" } };
    const to = { list: [1, 3, 4], nested: { x: "z" }, b: [true] };
    const { patch } = await call<JsonDiffOutput>("json.diff", { from, to });
    expect((await call<JsonPatchOutput>("json.patch", { value: from, patch })).value).toEqual(to);
    expect((await call<JsonDiffOutput>("json.diff", { from: to, to })).patch).toEqual([]);
  });

  it("merges a merge patch, and refuses a prototype key from the wire", async () => {
    expect((await call<JsonMergeOutput>("json.merge", { target: { a: 1, b: { c: 2 } }, patch: { a: null, b: { d: 3 } } })).value).toEqual({ b: { c: 2, d: 3 } });
    expect(await failure(call("json.merge", wire('{"target":{},"patch":{"__proto__":{"polluted":true}}}')))).toMatchObject({ code: "PROTOTYPE_KEY" });
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("json.validate", () => {
  it("gives the verdict and the problems", async () => {
    const schema = { type: "object", properties: { n: { type: "number" } }, required: ["n"] };
    expect(await call<JsonValidateOutput>("json.validate", { value: { n: 1 }, schema })).toEqual({ valid: true, errors: [], unchecked: [] });
    expect(await call<JsonValidateOutput>("json.validate", { value: { n: "1" }, schema })).toEqual({
      valid: false,
      errors: [{ pointer: "/n", message: "expected number, got string" }],
      unchecked: [],
    });
  });
});

describe("yaml.parse and yaml.stringify", () => {
  it("parses YAML and writes it again", async () => {
    const { value } = await call<YamlParseOutput>("yaml.parse", { text: "name: app\nports:\n  - 80\n  - 443\n" });
    expect(value).toEqual({ name: "app", ports: [80, 443] });
    const { text } = await call<YamlStringifyOutput>("yaml.stringify", { value, indent: 4 });
    expect(text).toBe("name: app\nports:\n    - 80\n    - 443\n");
    expect((await call<YamlParseOutput>("yaml.parse", { text: "a: 1\n---\nb: 2", all: true })).value).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("refuses bad YAML with INVALID_YAML", async () => {
    expect(await failure(call("yaml.parse", { text: "a: [1" }))).toMatchObject({ code: "INVALID_YAML" });
  });
});

describe("values that are not JSON", () => {
  it.each([
    ["json.query", { value: { a: Number.NaN }, pointer: "" }, '"/a" is the number NaN'],
    ["json.diff", { from: [1, undefined], to: [] }, '"/1" is a value of the type undefined'],
    ["json.merge", { target: { d: new Date(0) }, patch: {} }, '"/d" is an object of the class Date'],
    ["json.patch", { value: {}, patch: [{ op: "add", path: "/a", value: Number.POSITIVE_INFINITY }] }, "the value of operation 0"],
    ["yaml.stringify", { value: { f: () => 1 } }, '"/f" is a value of the type function'],
    ["json.validate", { value: 1n, schema: true }, "bigint"],
  ])("%s refuses them with NOT_JSON", async (key, input, message) => {
    const error = await failure(call(key, input));
    expect(error).toMatchObject({ code: "NOT_JSON" });
    expect(error.message).toContain(message);
  });

  it("refuses a value that refers to itself", async () => {
    const value: Record<string, unknown> = {};
    value["self"] = value;
    expect(await failure(call("json.query", { value, pointer: "" }))).toMatchObject({ code: "NOT_JSON" });
  });
});
