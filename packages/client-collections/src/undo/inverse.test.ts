import { describe, expect, it } from "vitest";
import { applyPatch, patchProblems, type StoragePatch, type StoragePatchOperations } from "@procedures/client/query";
import { inversePatch } from "../index.js";

/** A small random generator with a seed, so each run tests the same sequence. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** The patch, its inverse, and the check that the inverse gives the item before the patch. */
function roundTrip(before: Record<string, unknown>, patch: StoragePatch): StoragePatchOperations | undefined {
  const inverse = inversePatch(before, patch);
  if (inverse !== undefined) expect(applyPatch(applyPatch(before, patch), inverse)).toEqual(before);
  return inverse;
}

describe("inversePatch", () => {
  it("gives an $insert for a $remove of an element, and a $remove for an $insert", () => {
    const before = { tags: ["a", "b", "c"] };
    expect(roundTrip(before, { $remove: ["tags.1"] })).toEqual({ $insert: { "tags.1": "b" } });
    expect(roundTrip(before, { $insert: { "tags.0": "z" } })).toEqual({ $remove: ["tags.0"] });
    expect(roundTrip(before, { $insert: { "tags.3": "d" } })).toEqual({ $remove: ["tags.3"] });
  });

  it("gives the indices of the item after the patch", () => {
    const before = { tags: ["a", "b", "c", "d", "e"] };
    expect(roundTrip(before, { $remove: ["tags.1", "tags.3"] })).toEqual({ $insert: { "tags.1": "b", "tags.2": "d" } });
    expect(roundTrip(before, { $insert: { "tags.1": "x", "tags.3": "y" } })).toEqual({ $remove: ["tags.1", "tags.4"] });
    expect(roundTrip(before, { $set: { "tags.3": "D" }, $remove: ["tags.0"] })).toEqual({ $set: { "tags.2": "d" }, $insert: { "tags.0": "a" } });
    const nested = { rows: [{ keys: ["a", "b"] }, { keys: ["c"] }] };
    expect(roundTrip(nested, { $remove: ["rows.1", "rows.0.keys.0"] })).toEqual({ $insert: { "rows.0.keys.0": "a", "rows.1": { keys: ["c"] } } });
  });

  it("sets the old values of $set and $unset, and removes what $set made", () => {
    const before = { n: 1, meta: { kind: "k" }, list: [1, 2], gone: null };
    expect(roundTrip(before, { $set: { n: 2, "meta.kind": "j" } })).toEqual({ $set: { n: 1, "meta.kind": "k" } });
    expect(roundTrip(before, { $set: { "fresh.deep.path": 1, "meta.score": 3 } })).toEqual({ $remove: ["fresh", "meta.score"] });
    expect(roundTrip(before, { $set: { "list.2": 3 } })).toEqual({ $remove: ["list.2"] });
    expect(roundTrip(before, { $set: { "gone.x": 1 } })).toEqual({ $set: { gone: null } });
    expect(roundTrip(before, { $unset: ["meta.kind", "list.0", "missing"] })).toEqual({ $set: { "meta.kind": "k", "list.0": 1 } });
    expect(roundTrip(before, { $remove: ["meta.kind"] })).toEqual({ $set: { "meta.kind": "k" } });
  });

  it("inverts a JSON Merge Patch by its top fields", () => {
    const before = { n: 1, meta: { kind: "k", score: 2 } };
    expect(roundTrip(before, { n: null, meta: { score: 3 }, added: true })).toEqual({ $set: { n: 1, meta: { kind: "k", score: 2 } }, $remove: ["added"] });
    expect(inversePatch(before, { "a.b": 1 })).toBeUndefined();
  });

  it("gives undefined when no patch undoes the change exactly", () => {
    // Two adjacent removals put two elements back at one index of the item after the patch
    expect(inversePatch({ tags: ["a", "b", "c"] }, { $remove: ["tags.0", "tags.1"] })).toBeUndefined();
    // After the patch, the removed row and the element of the next row have the same path
    expect(inversePatch({ rows: [{ keys: ["a"] }, { keys: ["c"] }] }, { $remove: ["rows.0", "rows.1.keys.0"] })).toBeUndefined();
    // An item that is not an object becomes an object
    expect(inversePatch(undefined, { $set: { a: 1 } })).toBeUndefined();
    expect(inversePatch(5, { a: 1 })).toBeUndefined();
  });

  it("refuses the patches that applyPatch refuses", () => {
    expect(() => inversePatch({ tags: [] }, { $insert: { "tags.3": 1 } })).toThrow(TypeError);
    expect(() => inversePatch({}, { $inc: { n: 1 } })).toThrow(TypeError);
  });

  it("keeps a __proto__ field as an own field of the inverse", () => {
    const before = JSON.parse('{"__proto__": {"x": 1}, "n": 1}') as Record<string, unknown>;
    const inverse = roundTrip(before, { $set: { "__proto__.x": 2 } });
    expect(inverse).toBeDefined();
    expect(({} as Record<string, unknown>)["x"]).toBeUndefined();
  });

  it("finds an inverse patch for each patch of one operation, and moves undo by moves (1500 random items)", () => {
    const next = random(18);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
    const leaf = (): unknown => pick([0, 1, "s", null, true]);
    const value = (depth: number): unknown => {
      const r = next();
      if (depth <= 0 || r < 0.4) return leaf();
      if (r < 0.7) return Array.from({ length: Math.floor(next() * 4) }, () => value(depth - 1));
      return Object.fromEntries(Array.from({ length: 1 + Math.floor(next() * 3) }, () => [pick(["a", "b", "c", "d"]), value(depth - 1)]));
    };
    // Each path of a value, and each array path
    const paths = (v: unknown, prefix: string[] = [], out: string[][] = [], arrays: string[][] = []): { all: string[][]; arrays: string[][] } => {
      if (Array.isArray(v)) {
        arrays.push(prefix);
        v.forEach((item, i) => {
          out.push([...prefix, String(i)]);
          paths(item, [...prefix, String(i)], out, arrays);
        });
      } else if (v !== null && typeof v === "object") {
        for (const [key, item] of Object.entries(v)) {
          out.push([...prefix, key]);
          paths(item, [...prefix, key], out, arrays);
        }
      }
      return { all: out, arrays };
    };
    let multi = 0;
    let multiInverted = 0;
    for (let n = 0; n < 1500; n++) {
      const before = value(3);
      if (before === null || typeof before !== "object" || Array.isArray(before)) continue;
      const { all, arrays } = paths(before);
      const ops: Array<() => StoragePatchOperations | undefined> = [
        () => (all.length ? { $set: { [pick(all).join(".")]: leaf() } } : undefined),
        () => (all.length ? { $unset: [pick(all).join(".")] } : undefined),
        () => (all.length ? { $remove: [pick(all).join(".")] } : undefined),
        () => {
          const arrayPaths = arrays.filter((p) => p.length > 0);
          if (!arrayPaths.length) return undefined;
          const path = pick(arrayPaths);
          const length = (path.reduce<unknown>((v, key) => (v as Record<string, unknown>)[key], before) as unknown[]).length;
          return { $insert: { [[...path, String(Math.floor(next() * (length + 1)))].join(".")]: leaf() } };
        },
      ];
      const one = pick(ops)();
      if (one !== undefined && patchProblems(one).length === 0) {
        expect(roundTrip(before as Record<string, unknown>, one), JSON.stringify({ before, one })).toBeDefined();
      }
      // Two or three operations together
      const parts = Array.from({ length: 2 + Math.floor(next() * 2) }, () => pick(ops)()).filter((p) => p !== undefined);
      const patch: Record<string, unknown> = {};
      for (const part of parts) {
        for (const [key, field] of Object.entries(part)) {
          patch[key] = Array.isArray(field) ? [...((patch[key] as unknown[]) ?? []), ...field] : { ...(patch[key] as object), ...(field as object) };
        }
      }
      if (Object.keys(patch).length === 0 || patchProblems(patch).length > 0) continue;
      try {
        applyPatch(before, patch);
      } catch {
        continue;
      }
      multi++;
      const inverse = roundTrip(before as Record<string, unknown>, patch);
      if (inverse === undefined) continue;
      multiInverted++;
      // The undo of moves of elements is moves: the inverse sets no array
      if (Object.keys(patch).every((key) => key === "$insert")) expect(Object.keys(inverse), JSON.stringify({ before, patch, inverse })).toEqual(["$remove"]);
    }
    expect(multi).toBeGreaterThan(150);
    expect(multiInverted / multi).toBeGreaterThan(0.85);
  });
});
