/**
 * Hydration and the JSON helpers (deep dive 2026-10).
 *
 * - CORE-11: the JSON helpers keep `$when`/`$name`. A named context matches by name at every
 *   depth. `$never` protects its whole subtree.
 * - CORE-12: the depth limit counts refs only. Values that are not plain data stay untouched.
 *   `$literal` escapes a value. `parallel: false` runs siblings in order.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createRefScope,
  extractTemplate,
  fromJson,
  hydrateInput,
  parseProcedureJson,
  proc,
  stringifyProcedureJson,
  toJson,
  type ProcedureRef,
} from "./ref.js";

const echo = vi.fn(async (path: readonly string[], input: unknown) => ({ path: path.join("."), input }));

describe("CORE-11: the JSON helpers keep $when and $name", () => {
  const json = { $proc: ["a"], input: { x: 1 }, $when: "$never", $name: "n" };

  it("parseProcedureJson", () => {
    const ref = parseProcedureJson<ProcedureRef>(JSON.stringify(json));
    expect(ref.$when).toBe("$never");
    expect(ref.$name).toBe("n");
  });

  it("stringifyProcedureJson and extractTemplate", () => {
    const ref = proc(["a"]).input({ x: 1 }).name("n").when("$never").build();
    expect(JSON.parse(stringifyProcedureJson(ref))).toEqual(json);
    expect(extractTemplate(ref)).toEqual(json);
    expect(extractTemplate(fromJson(json))).toEqual(json);
  });

  it("toJson and fromJson", () => {
    const ref = fromJson(json);
    expect(ref.$when).toBe("$never");
    expect(ref.$name).toBe("n");
    expect(toJson(ref)).toEqual(json);
  });

  it("a $never ref parsed from JSON does not run", async () => {
    echo.mockClear();
    const input = parseProcedureJson(JSON.stringify({ later: json }));
    await hydrateInput(input, echo);
    expect(echo).not.toHaveBeenCalled();
  });

  it("$never protects its subtree", async () => {
    echo.mockClear();
    const input = { $proc: ["a"], $when: "$never", input: { nested: { $proc: ["b"], input: {} } } };
    expect(await hydrateInput(input, echo)).toEqual(input);
    expect(echo).not.toHaveBeenCalled();
  });

  it("a ref deferred to a name is data at every depth", async () => {
    const program = {
      $name: "ctx",
      $proc: ["outer"],
      input: { inner: { $proc: ["inner"], input: {}, $when: "ctx" } },
    };
    for (const input of [program, { nested: program }, { a: { b: program } }]) {
      echo.mockClear();
      await hydrateInput(input, echo);
      expect(echo.mock.calls.map(([path]) => path.join("."))).toEqual(["outer"]);
    }
  });

  it("a ref deferred to a name runs when the runner gives that name", async () => {
    echo.mockClear();
    await hydrateInput({ x: { $proc: ["inner"], input: {}, $when: "ctx" } }, echo, { contextStack: ["ctx"] });
    expect(echo.mock.calls.map(([path]) => path.join("."))).toEqual(["inner"]);
  });
});

describe("CORE-12: hydration leaves plain data alone", () => {
  const deep = (levels: number, leaf: unknown): unknown => (levels === 0 ? leaf : { nested: deep(levels - 1, leaf) });

  it("deep plain data does not count toward the depth limit", async () => {
    const input = deep(40, "leaf");
    expect(await hydrateInput(input, echo, { maxDepth: 10 })).toEqual(input);
  });

  it("refs nested deeper than the limit fail", async () => {
    const nestedRefs = (levels: number): unknown =>
      levels === 0 ? 1 : { $proc: ["p"], input: { v: nestedRefs(levels - 1) } };
    await expect(hydrateInput(nestedRefs(12), echo, { maxDepth: 10 })).rejects.toThrow("Hydration depth exceeded");
  });

  it("a cyclic input fails with a clear message", async () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic["self"] = cyclic;
    await expect(hydrateInput(cyclic, echo)).rejects.toThrow(/cycl/i);
  });

  it("values that are not plain objects stay unchanged", async () => {
    const date = new Date(0);
    const bytes = new Uint8Array([1, 2, 3]);
    const map = new Map([["k", 1]]);
    const result = await hydrateInput({ date, bytes, map }, echo);
    expect(result.date).toBe(date);
    expect(result.bytes).toBe(bytes);
    expect(result.map).toBe(map);
  });

  it("$literal gives its value without hydration", async () => {
    echo.mockClear();
    const scope = createRefScope();
    const input = {
      schema: { $literal: { $ref: "#/definitions/item" } },
      ref: { $literal: { $proc: ["never"], input: {} } },
    };
    expect(await hydrateInput(input, echo, { scope })).toEqual({
      schema: { $ref: "#/definitions/item" },
      ref: { $proc: ["never"], input: {} },
    });
    expect(echo).not.toHaveBeenCalled();
  });

  it("without a scope, a $ref object stays (a JSON Schema reference)", async () => {
    const input = { schema: { $ref: "#/definitions/item" } };
    expect(await hydrateInput(input, echo)).toEqual(input);
  });

  it("parallel: false runs sibling refs in order; parallel: true runs them together", async () => {
    const order = async (parallel: boolean): Promise<string[]> => {
      const events: string[] = [];
      const executor = async (path: readonly string[]): Promise<string> => {
        events.push(`start ${path[0]}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`end ${path[0]}`);
        return path[0]!;
      };
      await hydrateInput({ a: { $proc: ["a"], input: {} }, b: { $proc: ["b"], input: {} } }, executor, { parallel });
      return events;
    };
    expect(await order(false)).toEqual(["start a", "end a", "start b", "end b"]);
    expect(await order(true)).toEqual(["start a", "start b", "end a", "end b"]);
  });

  it("the default runs sibling refs in order", async () => {
    const events: string[] = [];
    await hydrateInput([1, { $proc: ["a"], input: {} }, { $proc: ["b"], input: {} }], async (path) => {
      events.push(`start ${path[0]}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`end ${path[0]}`);
      return undefined as never;
    });
    expect(events).toEqual(["start a", "end a", "start b", "end b"]);
  });
});
