import { describe, expect, it } from "vitest";
import { applyPatch } from "@procedures/client/query";
import { UNSET, copyAsPatch, isUnset, mergeCopies, resolveStacks, stackOf, type StackRule } from "./index.js";

describe("the overlay: one logical document through a stack of layers", () => {
  const base = { _id: "card", top: 10, left: 20, width: 300 };
  const mine = { _id: "card", _scope: "user:u1", top: 99 };

  it("the mode field: each field comes from the highest copy that has it", () => {
    expect(mergeCopies([mine, undefined, base])).toEqual({ _id: "card", top: 99, left: 20, width: 300 });
    expect(mergeCopies([undefined, undefined, base])).toEqual(base);
    expect(mergeCopies([mine])).toEqual({ _id: "card", top: 99 });
  });

  it("an UNSET field hides the lower values of that field", () => {
    expect(mergeCopies([{ _id: "card", _scope: "board:b1", width: UNSET }, base])).toEqual({ _id: "card", top: 10, left: 20 });
  });

  it("a deleted top copy hides the document, and a deleted copy lower down hides only the copies under it", () => {
    expect(mergeCopies([{ _id: "card", _scope: "user:u1", _deleted: true }, base])).toBeUndefined();
    expect(mergeCopies([mine, { _id: "card", _scope: "board:b1", _deleted: true }, base])).toEqual({ _id: "card", top: 99 });
  });

  it("the mode doc: the highest copy replaces the lower ones whole, without its UNSET fields", () => {
    const lower = { _id: "leaf", atom: "text", on: { x: 1 } };
    const upper = { _id: "leaf", _scope: "board:b1", atom: "text", rootClass: "mine", note: UNSET };
    expect(mergeCopies([upper, lower], "doc")).toEqual({ _id: "leaf", atom: "text", rootClass: "mine" });
  });

  it("no copy is no document", () => {
    expect(mergeCopies([undefined, undefined])).toBeUndefined();
    expect(mergeCopies([])).toBeUndefined();
  });

  it("takes other names for the fields of the overlay", () => {
    const fields = { deleted: "gone", layer: "layer" };
    expect(mergeCopies([{ id: 1, layer: "a", x: 2 }, { id: 1, layer: "b", y: 3 }], "field", fields)).toEqual({ id: 1, x: 2, y: 3 });
    expect(mergeCopies([{ id: 1, gone: true }, { id: 1, y: 3 }], "field", fields)).toBeUndefined();
    expect(mergeCopies([{ id: 1, _deleted: true, _scope: "s" }], "field", fields)).toEqual({ id: 1, _deleted: true, _scope: "s" });
  });

  it("knows the UNSET marker and nothing else", () => {
    expect(isUnset(UNSET)).toBe(true);
    expect(isUnset({ __unset: true })).toBe(true);
    expect(isUnset({ __unset: true, more: 1 })).toBe(false);
    expect(isUnset({ __unset: "yes" })).toBe(false);
    expect(isUnset([true])).toBe(false);
    expect(isUnset(null)).toBe(false);
  });
});

describe("the overlay and applyPatch", () => {
  it("gives a copy as the patch operations: its fields are $set, its UNSET fields are $unset", () => {
    expect(copyAsPatch({ _id: "c", _scope: "board:b1", _deleted: false, top: 1, note: null, width: UNSET })).toEqual({
      $set: { _id: "c", top: 1, note: null },
      $unset: ["width"],
    });
  });

  it("merges as applyPatch does: each copy is a patch over the copies under it (400 random stacks)", () => {
    let seed = 11;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const keys = ["a", "b", "c", "d"];
    const valueOf = (): unknown => {
      const r = rand();
      if (r < 0.2) return UNSET;
      if (r < 0.3) return null;
      if (r < 0.45) return { nested: Math.floor(rand() * 3) };
      return Math.floor(rand() * 10);
    };
    for (let n = 0; n < 400; n++) {
      const depth = 1 + Math.floor(rand() * 4);
      const copies = Array.from({ length: depth }, () => {
        const copy: Record<string, unknown> = {};
        for (const key of keys) if (rand() < 0.6) copy[key] = valueOf();
        return copy;
      });
      let patched: Record<string, unknown> = {};
      for (let index = copies.length - 1; index >= 0; index--) patched = applyPatch(patched, copyAsPatch(copies[index]!));
      expect(mergeCopies(copies)).toEqual(patched);
    }
  });

  it("is not a JSON Merge Patch: null is a value, and an object field replaces the lower object whole", () => {
    const lower = { a: { x: 1, y: 2 }, b: 1 };
    const upper = { a: { x: 9 }, b: null };
    expect(mergeCopies([upper, lower])).toEqual({ a: { x: 9 }, b: null });
    expect(applyPatch(lower, upper)).toEqual({ a: { x: 9, y: 2 } }); // the merge patch merges a and removes b
  });
});

describe("a copy with the key __proto__", () => {
  const hostile = (): Record<string, unknown> => JSON.parse('{"_id":"c","__proto__":{"isAdmin":true},"a":1}') as Record<string, unknown>;

  it("mergeCopies keeps it an own field, and the prototype does not change", () => {
    for (const mode of ["field", "doc"] as const) {
      const merged = mergeCopies([hostile(), { _id: "c", b: 2 }], mode)!;
      expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
      expect((merged as { isAdmin?: unknown }).isAdmin).toBeUndefined();
      expect(Object.keys(merged)).toContain("__proto__");
    }
  });

  it("copyAsPatch keeps it an own field of $set", () => {
    const patch = copyAsPatch(hostile());
    expect(Object.getPrototypeOf(patch.$set)).toBe(Object.prototype);
    expect((patch.$set as { isAdmin?: unknown }).isAdmin).toBeUndefined();
    expect(Object.keys(patch.$set!)).toEqual(["_id", "__proto__", "a"]);
  });
});

describe("the stacks from rules", () => {
  /** A resolver: `$me` is the user, `$board` the board, `$space` the space, a name stays, other variables give nothing. */
  const resolverFor = (user?: string) => (variable: string): string | undefined => {
    if (variable === "$space") return "space";
    if (variable === "$board") return "board:b1";
    if (variable === "$me") return user ? `user:${user}` : "device:me";
    return variable.startsWith("$") ? undefined : variable;
  };

  it("gives each collection its stack, its write targets and its mode", () => {
    const rules: StackRule[] = [
      { collection: ["notes", "cards"], read: ["$me", "$board", "$space"], write: "$board" },
      { collection: "defs", read: ["$board", "$space"], mode: "doc" },
    ];
    const stacks = resolveStacks(rules, resolverFor("u1"));
    expect(stacks.get("notes")).toEqual([{ layers: ["user:u1", "board:b1", "space"], write: ["board:b1"], mode: "field" }]);
    expect(stacks.get("cards")).toEqual(stacks.get("notes"));
    expect(stacks.get("defs")).toEqual([{ layers: ["board:b1", "space"], write: ["board:b1"], mode: "doc" }]);
    expect(resolveStacks(rules, resolverFor()).get("notes")?.[0]?.layers).toEqual(["device:me", "board:b1", "space"]);
  });

  it("puts a rule for some documents before the rule of their collection, and the first rule for all documents wins", () => {
    const stacks = resolveStacks(
      [
        { collection: "cards", doc: ["pinned"], read: ["$me"] },
        { collection: "cards", read: ["$board", "$space"] },
        { collection: "cards", read: ["$space"] },
        { collection: "cards", doc: "late", read: ["$me"] },
      ],
      resolverFor("u1")
    );
    expect(stacks.get("cards")).toHaveLength(2);
    expect(stackOf(stacks, "cards", "pinned")?.layers).toEqual(["user:u1"]);
    expect(stackOf(stacks, "cards", "other")?.layers).toEqual(["board:b1", "space"]);
    expect(stackOf(stacks, "cards")?.layers).toEqual(["board:b1", "space"]);
    expect(stackOf(stacks, "unknown", "x")).toBeUndefined();
  });

  it("skips a rule that resolves to no layer, removes repeated layers, and keeps a pattern collection", () => {
    const stacks = resolveStacks(
      [
        { collection: "x", read: ["$unknown"] },
        { collection: "*", read: ["$space", "$space", "$board"], write: ["$unknown"] },
        { collection: ["", "y"], read: ["$space"] },
        null as unknown as StackRule,
      ],
      resolverFor()
    );
    expect(stacks.has("x")).toBe(false);
    expect(stacks.get("*")).toEqual([{ layers: ["space", "board:b1"], write: ["space"], mode: "field" }]);
    expect([...stacks.keys()]).toEqual(["*", "y"]);
    expect(resolveStacks(undefined, resolverFor()).size).toBe(0);
  });
});
