/**
 * The List contract: ArrayList and LinkedList against a JavaScript array.
 *
 * The rule of the library: push/pop work at the end and shift/unshift at the front, as on a
 * JavaScript array. An operation that needs an element throws on an empty list, and an index
 * outside the list throws a RangeError.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { arrayList } from "../impl/array-list.js";
import { linkedList } from "../impl/linked-list.js";
import type { List } from "../interfaces/list.js";
import { runModel, smallInt, step, type Step } from "./model.js";

type S = List<number>;
type M = number[];

const steps: fc.Arbitrary<Step<S, M>> = fc.oneof(
  smallInt.map((x) => step<S, M>(`add(${x})`, (s, m) => expect(s.add(x)).toBe(m.push(x) > 0))),
  smallInt.map((x) => step<S, M>(`push(${x})`, (s, m) => (s.push(x), m.push(x)))),
  smallInt.map((x) => step<S, M>(`unshift(${x})`, (s, m) => (s.unshift(x), m.unshift(x)))),
  fc.tuple(fc.nat(), smallInt).map(([i, x]) =>
    step<S, M>(`insert(${i}, ${x})`, (s, m) => {
      const index = i % (m.length + 1);
      s.insert(index, x);
      m.splice(index, 0, x);
    }),
  ),
  fc.tuple(fc.nat(), smallInt).map(([i, x]) =>
    step<S, M>(`set(${i}, ${x})`, (s, m) => {
      if (m.length === 0) return expect(() => s.set(0, x)).toThrow(RangeError);
      const index = i % m.length;
      expect(s.set(index, x)).toBe(m[index]);
      m[index] = x;
    }),
  ),
  fc.nat().map((i) =>
    step<S, M>(`removeAt(${i})`, (s, m) => {
      if (m.length === 0) return expect(() => s.removeAt(0)).toThrow(RangeError);
      const index = i % m.length;
      expect(s.removeAt(index)).toBe(m.splice(index, 1)[0]);
    }),
  ),
  smallInt.map((x) =>
    step<S, M>(`remove(${x})`, (s, m) => {
      const index = m.indexOf(x);
      expect(s.remove(x)).toBe(index >= 0);
      if (index >= 0) m.splice(index, 1);
    }),
  ),
  fc.constant(
    step<S, M>("pop()", (s, m) => {
      if (m.length === 0) return expect(() => s.pop()).toThrow();
      expect(s.pop()).toBe(m.pop());
    }),
  ),
  fc.constant(
    step<S, M>("shift()", (s, m) => {
      if (m.length === 0) return expect(() => s.shift()).toThrow();
      expect(s.shift()).toBe(m.shift());
    }),
  ),
  fc.tuple(fc.nat(), fc.nat()).map(([a, b]) =>
    step<S, M>(`removeRange(${a}, ${b})`, (s, m) => {
      const from = a % (m.length + 1);
      const to = from + (b % (m.length - from + 1));
      s.removeRange(from, to);
      m.splice(from, to - from);
    }),
  ),
  fc.constant(step<S, M>("sort()", (s, m) => (s.sort((a, b) => a - b), m.sort((a, b) => a - b)))),
  fc.constant(step<S, M>("reverse()", (s, m) => (s.reverse(), m.reverse()))),
  fc.array(smallInt, { maxLength: 5 }).map((xs) =>
    step<S, M>(`addAll(${xs})`, (s, m) => {
      expect(s.addAll(xs)).toBe(xs.length > 0);
      m.push(...xs);
    }),
  ),
  fc.array(smallInt, { maxLength: 5 }).map((xs) =>
    step<S, M>(`removeAll(${xs})`, (s, m) => {
      const kept = m.filter((x) => !xs.includes(x));
      expect(s.removeAll(xs)).toBe(kept.length !== m.length);
      m.splice(0, m.length, ...kept);
    }),
  ),
  fc.array(smallInt, { maxLength: 8 }).map((xs) =>
    step<S, M>(`retainAll(${xs})`, (s, m) => {
      const kept = m.filter((x) => xs.includes(x));
      expect(s.retainAll(xs)).toBe(kept.length !== m.length);
      m.splice(0, m.length, ...kept);
    }),
  ),
  fc.constant(step<S, M>("clear()", (s, m) => (s.clear(), m.splice(0)))),
);

function check(s: S, m: M): void {
  expect(s.size).toBe(m.length);
  expect(s.isEmpty).toBe(m.length === 0);
  expect(s.toArray()).toEqual(m);
  expect([...s]).toEqual(m);
  for (let i = 0; i < m.length; i++) expect(s.get(i)).toBe(m[i]);
  if (m.length > 0) {
    expect(s.first()).toBe(m[0]);
    expect(s.last()).toBe(m[m.length - 1]);
  } else {
    expect(() => s.first()).toThrow();
    expect(() => s.last()).toThrow();
  }
  expect(() => s.get(m.length)).toThrow(RangeError);
  expect(() => s.get(-1)).toThrow(RangeError);
  for (const x of [-1, 0, 1, 7]) {
    expect(s.contains(x)).toBe(m.includes(x));
    expect(s.indexOf(x)).toBe(m.indexOf(x));
    expect(s.lastIndexOf(x)).toBe(m.lastIndexOf(x));
  }
}

for (const [name, create] of [
  ["ArrayList", () => arrayList<number>()],
  ["LinkedList", () => linkedList<number>()],
] as const) {
  describe(`${name} follows the List contract`, () => {
    it("matches a JavaScript array for random operation sequences", () => {
      runModel<S, M>({ create: () => ({ sut: create(), model: [] }), steps, check });
    });

    it("subList is a view of a range", () => {
      const list = create();
      list.addAll([0, 1, 2, 3, 4, 5]);
      expect(list.subList(1, 4).toArray()).toEqual([1, 2, 3]);
      expect(() => list.subList(4, 1)).toThrow(RangeError);
    });
  });
}
