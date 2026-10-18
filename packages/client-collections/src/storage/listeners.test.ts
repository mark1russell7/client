/**
 * The listeners of the storages and the observers of `InMemoryStorage` (roadmap CLI-20), and the
 * query policy of `InMemoryStorage`. The query language itself is in the core, and its tests are
 * there (`@procedures/client`, roadmap CLI-34). The contract suite of `../testing` runs the
 * selectors against each storage.
 */

import { describe, expect, it } from "vitest";
import { QUERY_OPERATORS } from "@procedures/client/query";
import { StorageListeners, reportListenerError } from "./listeners.js";
import { InMemoryStorage } from "./memory.js";

describe("StorageListeners", () => {
  it("gives each event to each listener, and a listener error goes to the handler", () => {
    const errors: unknown[] = [];
    const listeners = new StorageListeners<number>((error) => errors.push(error));
    const seen: string[] = [];
    listeners.add((event) => seen.push(`a${event}`));
    listeners.add(() => {
      throw new Error("the listener failed");
    });
    const removeC = listeners.add((event) => seen.push(`c${event}`));
    listeners.emit(1);
    removeC();
    removeC();
    listeners.emit(2);
    expect(seen).toEqual(["a1", "c1", "a2"]);
    expect(errors.map((error) => (error as Error).message)).toEqual(["the listener failed", "the listener failed"]);
    expect(listeners.size).toBe(2);
    listeners.clear();
    expect(listeners.size).toBe(0);
  });

  it("a listener that an earlier listener removes gets no event, and a new listener gets the next event", () => {
    const listeners = new StorageListeners<number>();
    const seen: string[] = [];
    let removeB: () => void = () => undefined;
    listeners.add((event) => {
      seen.push(`a${event}`);
      removeB();
      listeners.add((next) => seen.push(`new${next}`));
    });
    removeB = listeners.add((event) => seen.push(`b${event}`));
    listeners.emit(1);
    expect(seen).toEqual(["a1"]);
  });

  it("the same function added two times gets each event two times", () => {
    const listeners = new StorageListeners<number>();
    let count = 0;
    const listener = (): void => {
      count++;
    };
    const first = listeners.add(listener);
    listeners.add(listener);
    listeners.emit(1);
    first();
    listeners.emit(2);
    expect(count).toBe(3);
  });

  it("reportListenerError throws the error again in a microtask", async () => {
    const tasks: Array<() => void> = [];
    const original = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (task: () => void) => {
      tasks.push(task);
    };
    try {
      reportListenerError(new Error("late"));
    } finally {
      globalThis.queueMicrotask = original;
    }
    expect(tasks).toHaveLength(1);
    expect(() => tasks[0]!()).toThrow("late");
  });
});

describe("InMemoryStorage.observe()", () => {
  it("gives the error of an observer to onObserverError, and the write and the other observers go on", async () => {
    const errors: unknown[] = [];
    const storage = new InMemoryStorage<{ n: number }>({ onObserverError: (error) => errors.push(error) });
    const seen: string[] = [];
    storage.observe(() => {
      throw new Error("the observer failed");
    });
    storage.observe((batch) => seen.push(...batch.map((change) => change.type)));
    await storage.set("a", { n: 1 });
    expect(await storage.get("a")).toEqual({ n: 1 });
    expect(seen).toEqual(["set"]);
    expect((errors[0] as Error).message).toBe("the observer failed");
  });

  it("with copies: false, a change has the stored value itself", async () => {
    const storage = new InMemoryStorage<{ n: number }>({ copies: false });
    const values: unknown[] = [];
    storage.observe((batch) => {
      for (const change of batch) if (change.type === "set") values.push(change.value);
    });
    const value = { n: 1 };
    await storage.set("a", value);
    expect(values[0]).toBe(value);
    expect(await storage.patch("a", { n: 2 })).toEqual({ n: 2 });
  });
});

describe("InMemoryStorage: the query policy and the patch forms", () => {
  it("refuses $regex by default, and runs it with the option queryPolicy or the policy of the call", async () => {
    const plain = new InMemoryStorage<{ name: string }>();
    await plain.set("a", { name: "Delta" });
    await expect(plain.query({ name: { $regex: "^D" } })).rejects.toThrow("does not permit the operator $regex");
    expect(await plain.query({ name: { $regex: "^D" } }, {}, { operators: QUERY_OPERATORS })).toEqual([["a", { name: "Delta" }]]);
    const open = new InMemoryStorage<{ name: string }>({ queryPolicy: { operators: QUERY_OPERATORS, maxRegexLength: 2 } });
    await open.set("a", { name: "Delta" });
    expect(await open.query({ name: { $regex: "^D" } })).toEqual([["a", { name: "Delta" }]]);
    await expect(open.query({ name: { $regex: "^De" } })).rejects.toThrow(/more than the 2 of the query policy/);
  });

  it("patch() applies the operations form, and a patch that cannot apply changes nothing", async () => {
    const storage = new InMemoryStorage<Record<string, unknown>>();
    await storage.set("a", { n: 1, meta: { kind: "k" } });
    expect(await storage.patch("a", { $set: { "meta.kind": "k2", note: null }, $unset: ["n"] })).toEqual({ meta: { kind: "k2" }, note: null });
    // meta.kind is a string: a path through it cannot apply
    await expect(storage.patch("a", { $set: { "meta.kind.x": 1 } })).rejects.toThrow(TypeError);
    await expect(storage.patch("a", { $set: { n: 1 }, m: 2 })).rejects.toThrow(/mixes operations and fields/);
    expect(await storage.get("a")).toEqual({ meta: { kind: "k2" }, note: null });
  });
});
