import { describe, it, expect } from "vitest";
import { focusAfterRemoval, insertChoices, wrapInChain } from "./edits";
import type { Field } from "../data/index.js";
import type { Json, ProcRef } from "./program";

const fields: Record<string, Field[]> = {
  "client.add": [
    { name: "a", type: "number", optional: false },
    { name: "b", type: "number", optional: false },
  ],
  "client.chain": [{ name: "steps", type: "unknown[]", optional: false }],
  "client.toUpper": [{ name: "value", type: "string", optional: false }],
};
const fieldsOf = (key: string): Field[] | null => fields[key] ?? null;
const add = (a: Json, b: Json): ProcRef => ({ $proc: ["client", "add"], input: { a, b } });
const upper: ProcRef = { $proc: ["client", "toUpper"], input: { value: "" } };

describe("insertChoices (deep dive SITE-3)", () => {
  it("puts a call in an empty slot at once", () => {
    const choices = insertChoices(add(0, 2), ["input", "a"], upper, fieldsOf);
    expect(choices).toHaveLength(1);
    expect(choices[0]!.program).toEqual(add(upper as unknown as Json, 2));
  });

  it("asks before it replaces a call", () => {
    const program = add(add(1, 0) as unknown as Json, 2) as unknown as Json;
    const choices = insertChoices(program, ["input", "a"], upper, fieldsOf);
    expect(choices.map((choice) => choice.id)).toEqual(["inside", "wrap", "replace"]);
    expect(choices.find((choice) => choice.id === "replace")!.destructive).toBe(true);
    // inside: the first empty field of the old call
    expect(choices[0]!.label).toBe("Put toUpper in add.b");
    expect(choices[0]!.select).toEqual(["input", "a", "input", "b"]);
    // wrap: the old call goes into the first required field of the new call
    expect(choices[1]!.program).toEqual(add({ $proc: ["client", "toUpper"], input: { value: add(1, 0) as unknown as Json } }, 2));
  });

  it("adds a call to the steps of a chain", () => {
    const program: Json = { $proc: ["client", "chain"], input: { steps: [add(1, 2) as unknown as Json] } };
    const inside = insertChoices(program, [], upper, fieldsOf)[0]!;
    expect(inside.label).toBe("Add toUpper to chain.steps");
    expect(inside.select).toEqual(["input", "steps", 1]);
  });

  it("appends to a list", () => {
    const choices = insertChoices({ $proc: ["client", "identity"], input: { value: [1] } }, ["input", "value"], upper, fieldsOf);
    expect(choices.map((choice) => choice.id)).toEqual(["append", "replace"]);
  });
});

describe("other edits", () => {
  it("wraps a call in a chain", () => {
    expect(wrapInChain(add(1, 2) as unknown as Json, [])).toEqual({ $proc: ["client", "chain"], input: { steps: [add(1, 2)] } });
    expect(wrapInChain(5, [])).toBe(5);
  });

  it("gives the slot for the focus after a removal (deep dive SITE-7)", () => {
    expect(focusAfterRemoval(["l"], 0, 3)).toEqual(["l", 0]);
    expect(focusAfterRemoval(["l"], 2, 3)).toEqual(["l", 1]);
    expect(focusAfterRemoval(["l"], 0, 1)).toEqual(["l"]);
  });
});
