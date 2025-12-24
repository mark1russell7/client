/**
 * Unit tests for logic operators
 */

import { describe, it, expect } from "vitest";
import {
  variadicLogic,
  unaryLogic,
  andHandler,
  orHandler,
  notHandler,
  allHandler,
  anyHandler,
  noneHandler,
  andMetadata,
  orMetadata,
  notMetadata,
  allMetadata,
  anyMetadata,
  noneMetadata,
} from "./logic.js";

describe("variadicLogic factory", () => {
  it("creates handler that short-circuits on matching predicate", async () => {
    // Short-circuit on values > 5
    const handler = variadicLogic(v => (v as number) > 5);

    const result = await handler({ values: [1, 2, 10, 3, 4] });

    expect(result).toBe(10); // Should stop at first value > 5
  });

  it("returns last value when no short-circuit triggered", async () => {
    const handler = variadicLogic(v => (v as number) > 100);

    const result = await handler({ values: [1, 2, 3, 4, 5] });

    expect(result).toBe(5); // Last value
  });

  it("handles empty array", async () => {
    const handler = variadicLogic(() => true);

    const result = await handler({ values: [] });

    expect(result).toBeUndefined();
  });

  it("handles single value", async () => {
    const handler = variadicLogic(() => false);

    const result = await handler({ values: [42] });

    expect(result).toBe(42);
  });
});

describe("unaryLogic factory", () => {
  it("creates handler that transforms value", async () => {
    const handler = unaryLogic((v: unknown) => (v as number) * 2);

    const result = await handler({ value: 21 });

    expect(result).toBe(42);
  });

  it("handles null/undefined", async () => {
    const handler = unaryLogic(v => v === null ? "null" : "other");

    expect(await handler({ value: null })).toBe("null");
    expect(await handler({ value: undefined })).toBe("other");
  });
});

describe("and operator", () => {
  it("returns first falsy value (short-circuit)", async () => {
    const result = await andHandler({ values: [1, 2, 0, 3, 4] });

    expect(result).toBe(0);
  });

  it("returns last value if all truthy", async () => {
    const result = await andHandler({ values: [1, 2, 3, "hello", true] });

    expect(result).toBe(true);
  });

  it("handles empty array", async () => {
    const result = await andHandler({ values: [] });

    expect(result).toBeUndefined();
  });

  it("short-circuits on false", async () => {
    const result = await andHandler({ values: [true, false, true] });

    expect(result).toBe(false);
  });

  it("short-circuits on null", async () => {
    const result = await andHandler({ values: ["a", null, "b"] });

    expect(result).toBeNull();
  });

  it("short-circuits on undefined", async () => {
    const result = await andHandler({ values: [1, undefined, 2] });

    expect(result).toBeUndefined();
  });

  it("short-circuits on empty string", async () => {
    const result = await andHandler({ values: ["a", "", "b"] });

    expect(result).toBe("");
  });

  it("returns last truthy when all are truthy", async () => {
    const result = await andHandler({ values: ["a", "b", "c"] });

    expect(result).toBe("c");
  });
});

describe("or operator", () => {
  it("returns first truthy value (short-circuit)", async () => {
    const result = await orHandler({ values: [0, null, "found", 42] });

    expect(result).toBe("found");
  });

  it("returns last value if all falsy", async () => {
    const result = await orHandler({ values: [0, false, null, ""] });

    expect(result).toBe("");
  });

  it("handles empty array", async () => {
    const result = await orHandler({ values: [] });

    expect(result).toBeUndefined();
  });

  it("short-circuits on first truthy", async () => {
    const result = await orHandler({ values: [false, 1, false] });

    expect(result).toBe(1);
  });

  it("short-circuits on truthy object", async () => {
    const obj = { key: "value" };
    const result = await orHandler({ values: [null, obj, "string"] });

    expect(result).toBe(obj);
  });

  it("returns last falsy when all are falsy", async () => {
    const result = await orHandler({ values: [false, 0, null] });

    expect(result).toBeNull();
  });
});

describe("not operator", () => {
  it("inverts truthy to false", async () => {
    expect(await notHandler({ value: true })).toBe(false);
    expect(await notHandler({ value: 1 })).toBe(false);
    expect(await notHandler({ value: "string" })).toBe(false);
    expect(await notHandler({ value: {} })).toBe(false);
    expect(await notHandler({ value: [] })).toBe(false);
  });

  it("inverts falsy to true", async () => {
    expect(await notHandler({ value: false })).toBe(true);
    expect(await notHandler({ value: 0 })).toBe(true);
    expect(await notHandler({ value: "" })).toBe(true);
    expect(await notHandler({ value: null })).toBe(true);
    expect(await notHandler({ value: undefined })).toBe(true);
  });

  it("double negation returns original truthiness", async () => {
    const value = "truthy";
    const once = await notHandler({ value });
    const twice = await notHandler({ value: once });

    expect(once).toBe(false);
    expect(twice).toBe(true);
  });
});

describe("all operator", () => {
  it("returns true if all values truthy", async () => {
    const result = await allHandler({ values: [1, "a", true, {}, []] });

    expect(result).toBe(true);
  });

  it("returns false if any value falsy", async () => {
    const result = await allHandler({ values: [1, 2, 0, 3] });

    expect(result).toBe(false);
  });

  it("returns true for empty array (vacuous truth)", async () => {
    const result = await allHandler({ values: [] });

    expect(result).toBe(true);
  });

  it("returns false on first falsy (short-circuit behavior)", async () => {
    const result = await allHandler({ values: [true, false, true] });

    expect(result).toBe(false);
  });
});

describe("any operator", () => {
  it("returns true if any value truthy", async () => {
    const result = await anyHandler({ values: [0, null, 1, false] });

    expect(result).toBe(true);
  });

  it("returns false if all values falsy", async () => {
    const result = await anyHandler({ values: [0, false, null, ""] });

    expect(result).toBe(false);
  });

  it("returns false for empty array", async () => {
    const result = await anyHandler({ values: [] });

    expect(result).toBe(false);
  });

  it("returns true on first truthy (short-circuit behavior)", async () => {
    const result = await anyHandler({ values: [false, true, false] });

    expect(result).toBe(true);
  });
});

describe("none operator", () => {
  it("returns true if all values falsy", async () => {
    const result = await noneHandler({ values: [0, false, null, ""] });

    expect(result).toBe(true);
  });

  it("returns false if any value truthy", async () => {
    const result = await noneHandler({ values: [0, null, 1, false] });

    expect(result).toBe(false);
  });

  it("returns true for empty array (vacuous truth)", async () => {
    const result = await noneHandler({ values: [] });

    expect(result).toBe(true);
  });

  it("returns false on first truthy", async () => {
    const result = await noneHandler({ values: [false, true, false] });

    expect(result).toBe(false);
  });
});

describe("metadata properties", () => {
  describe("and metadata", () => {
    it("has correct arity", () => {
      expect(andMetadata.arity).toBe("variadic");
    });

    it("is commutative", () => {
      expect(andMetadata.commutative).toBe(true);
    });

    it("short-circuits", () => {
      expect(andMetadata.shortCircuit).toBe(true);
    });
  });

  describe("or metadata", () => {
    it("has correct arity", () => {
      expect(orMetadata.arity).toBe("variadic");
    });

    it("is commutative", () => {
      expect(orMetadata.commutative).toBe(true);
    });

    it("short-circuits", () => {
      expect(orMetadata.shortCircuit).toBe(true);
    });
  });

  describe("not metadata", () => {
    it("has unary arity", () => {
      expect(notMetadata.arity).toBe("unary");
    });

    it("is not commutative (n/a)", () => {
      expect(notMetadata.commutative).toBe(false);
    });

    it("does not short-circuit", () => {
      expect(notMetadata.shortCircuit).toBe(false);
    });
  });

  describe("all metadata", () => {
    it("has variadic arity", () => {
      expect(allMetadata.arity).toBe("variadic");
    });

    it("is commutative", () => {
      expect(allMetadata.commutative).toBe(true);
    });
  });

  describe("any metadata", () => {
    it("has variadic arity", () => {
      expect(anyMetadata.arity).toBe("variadic");
    });

    it("is commutative", () => {
      expect(anyMetadata.commutative).toBe(true);
    });
  });

  describe("none metadata", () => {
    it("has variadic arity", () => {
      expect(noneMetadata.arity).toBe("variadic");
    });

    it("is commutative", () => {
      expect(noneMetadata.commutative).toBe(true);
    });
  });
});

describe("commutativity verification", () => {
  it("all returns same boolean regardless of order", async () => {
    const values1 = [1, 2, 3];
    const values2 = [3, 1, 2];
    const values3 = [2, 3, 1];

    const result1 = await allHandler({ values: values1 });
    const result2 = await allHandler({ values: values2 });
    const result3 = await allHandler({ values: values3 });

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it("any returns same boolean regardless of order", async () => {
    const values1 = [0, 1, 0];
    const values2 = [1, 0, 0];
    const values3 = [0, 0, 1];

    const result1 = await anyHandler({ values: values1 });
    const result2 = await anyHandler({ values: values2 });
    const result3 = await anyHandler({ values: values3 });

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it("none returns same boolean regardless of order", async () => {
    const values1 = [0, null, false];
    const values2 = [null, false, 0];
    const values3 = [false, 0, null];

    const result1 = await noneHandler({ values: values1 });
    const result2 = await noneHandler({ values: values2 });
    const result3 = await noneHandler({ values: values3 });

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });
});

describe("edge cases", () => {
  it("handles NaN as falsy in and", async () => {
    const result = await andHandler({ values: [1, NaN, 2] });

    expect(result).toBeNaN();
  });

  it("handles -0 as falsy in and", async () => {
    const result = await andHandler({ values: [1, -0, 2] });

    expect(result).toBe(-0);
  });

  it("handles Infinity as truthy in or", async () => {
    const result = await orHandler({ values: [0, Infinity, 2] });

    expect(result).toBe(Infinity);
  });

  it("handles array with single falsy in all", async () => {
    const result = await allHandler({ values: [false] });

    expect(result).toBe(false);
  });

  it("handles array with single truthy in any", async () => {
    const result = await anyHandler({ values: [1] });

    expect(result).toBe(true);
  });
});
