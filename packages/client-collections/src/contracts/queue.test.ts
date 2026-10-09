/**
 * The Deque contract (ArrayDeque, LinkedList) and the PriorityQueue contract, against arrays.
 *
 * Regressions: BUGS-2026-07 C8 (ArrayDeque lost all elements when it grew) and C9 (PriorityQueue
 * was broken from construction).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { arrayDeque } from "../impl/array-deque.js";
import { linkedList } from "../impl/linked-list.js";
import { priorityQueue } from "../impl/priority-queue.js";
import type { Deque, PriorityQueue } from "../interfaces/queue.js";
import { runModel, smallInt, step, type Step } from "./model.js";

type D = Deque<number>;
type M = number[];

const dequeSteps: fc.Arbitrary<Step<D, M>> = fc.oneof(
  smallInt.map((x) => step<D, M>(`addFirst(${x})`, (s, m) => (s.addFirst(x), m.unshift(x)))),
  smallInt.map((x) => step<D, M>(`addLast(${x})`, (s, m) => (s.addLast(x), m.push(x)))),
  smallInt.map((x) => step<D, M>(`offerFirst(${x})`, (s, m) => (expect(s.offerFirst(x)).toBe(true), m.unshift(x)))),
  smallInt.map((x) => step<D, M>(`offer(${x})`, (s, m) => (expect(s.offer(x)).toBe(true), m.push(x)))),
  smallInt.map((x) => step<D, M>(`push(${x})`, (s, m) => (s.push(x), m.push(x)))),
  fc.constant(
    step<D, M>("removeFirst()", (s, m) => {
      if (m.length === 0) return expect(() => s.removeFirst()).toThrow();
      expect(s.removeFirst()).toBe(m.shift());
    }),
  ),
  fc.constant(
    step<D, M>("removeLast()", (s, m) => {
      if (m.length === 0) return expect(() => s.removeLast()).toThrow();
      expect(s.removeLast()).toBe(m.pop());
    }),
  ),
  fc.constant(step<D, M>("pollFirst()", (s, m) => expect(s.pollFirst()).toBe(m.shift()))),
  fc.constant(step<D, M>("pollLast()", (s, m) => expect(s.pollLast()).toBe(m.pop()))),
  fc.constant(
    step<D, M>("poll()", (s, m) => {
      if (m.length === 0) return expect(() => s.poll()).toThrow();
      expect(s.poll()).toBe(m.shift());
    }),
  ),
  fc.constant(
    step<D, M>("pop()", (s, m) => {
      if (m.length === 0) return expect(() => s.pop()).toThrow();
      expect(s.pop()).toBe(m.pop());
    }),
  ),
  smallInt.map((x) =>
    step<D, M>(`remove(${x})`, (s, m) => {
      const index = m.indexOf(x);
      expect(s.remove(x)).toBe(index >= 0);
      if (index >= 0) m.splice(index, 1);
    }),
  ),
  fc.constant(step<D, M>("clear()", (s, m) => (s.clear(), m.splice(0)))),
  // Many elements at once, so the array grows (and wraps) often
  fc.tuple(fc.array(smallInt, { minLength: 5, maxLength: 20 }), fc.boolean()).map(([xs, first]) =>
    step<D, M>(`add${first ? "First" : "Last"} x${xs.length}`, (s, m) => {
      for (const x of xs) {
        if (first) (s.addFirst(x), m.unshift(x));
        else (s.addLast(x), m.push(x));
      }
    }),
  ),
);

function checkDeque(s: D, m: M): void {
  expect(s.size).toBe(m.length);
  expect(s.isEmpty).toBe(m.length === 0);
  expect(s.toArray()).toEqual(m);
  expect([...s]).toEqual(m);
  expect(s.peekFirstOrUndefined()).toBe(m[0]);
  expect(s.peekLastOrUndefined()).toBe(m[m.length - 1]);
  expect(s.peekOrUndefined()).toBe(m[0]);
  if (m.length === 0) {
    expect(() => s.peekFirst()).toThrow();
    expect(() => s.peekLast()).toThrow();
    expect(() => s.peek()).toThrow();
  } else {
    expect(s.peekFirst()).toBe(m[0]);
    expect(s.peekLast()).toBe(m[m.length - 1]);
  }
  for (const x of [-1, 0, 3]) expect(s.contains(x)).toBe(m.includes(x));
}

for (const [name, create] of [
  ["ArrayDeque", () => arrayDeque<number>({ initialCapacity: 2 })],
  ["ArrayDeque (default capacity)", () => arrayDeque<number>()],
  ["LinkedList", () => linkedList<number>()],
] as const) {
  describe(`${name} follows the Deque contract`, () => {
    it("matches a JavaScript array for random operation sequences", () => {
      runModel<D, M>({ create: () => ({ sut: create() as D, model: [] }), steps: dequeSteps, check: checkDeque, maxSteps: 200 });
    });

    it("keeps its elements when it grows past its capacity (C8)", () => {
      const deque = create() as D;
      for (let i = 0; i < 1000; i++) (i % 2 === 0 ? deque.addLast(i) : deque.addFirst(i));
      expect(deque.size).toBe(1000);
      const all = deque.toArray();
      expect(new Set(all).size).toBe(1000);
      expect(all[0]).toBe(999);
      expect(all[all.length - 1]).toBe(998);
    });
  });
}

type Q = PriorityQueue<number>;

const pqSteps: fc.Arbitrary<Step<Q, M>> = fc.oneof(
  smallInt.map((x) => step<Q, M>(`offer(${x})`, (s, m) => (expect(s.offer(x)).toBe(true), m.push(x)))),
  smallInt.map((x) => step<Q, M>(`add(${x})`, (s, m) => (expect(s.add(x)).toBe(true), m.push(x)))),
  fc.constant(
    step<Q, M>("poll()", (s, m) => {
      if (m.length === 0) return expect(() => s.poll()).toThrow();
      m.sort((a, b) => a - b);
      expect(s.poll()).toBe(m.shift());
    }),
  ),
  fc.constant(
    step<Q, M>("pollOrUndefined()", (s, m) => {
      m.sort((a, b) => a - b);
      expect(s.pollOrUndefined()).toBe(m.shift());
    }),
  ),
  smallInt.map((x) =>
    step<Q, M>(`remove(${x})`, (s, m) => {
      const index = m.indexOf(x);
      expect(s.remove(x)).toBe(index >= 0);
      if (index >= 0) m.splice(index, 1);
    }),
  ),
  fc.constant(step<Q, M>("clear()", (s, m) => (s.clear(), m.splice(0)))),
);

function checkPq(s: Q, m: M): void {
  const sorted = [...m].sort((a, b) => a - b);
  expect(s.size).toBe(m.length);
  expect(s.isEmpty).toBe(m.length === 0);
  expect(s.peekOrUndefined()).toBe(sorted[0]);
  if (m.length === 0) expect(() => s.peek()).toThrow();
  else expect(s.peek()).toBe(sorted[0]);
  expect([...s.toArray()].sort((a, b) => a - b)).toEqual(sorted);
  for (const x of [-1, 0, 3]) expect(s.contains(x)).toBe(m.includes(x));
}

describe("PriorityQueue follows the PriorityQueue contract (C9)", () => {
  it("polls the smallest element first, for random operation sequences", () => {
    runModel<Q, M>({ create: () => ({ sut: priorityQueue<number>(), model: [] }), steps: pqSteps, check: checkPq, maxSteps: 200 });
  });

  it("takes a comparator (largest first)", () => {
    const queue = priorityQueue<number>((a, b) => b - a);
    for (const x of [3, 9, 1, 7]) queue.offer(x);
    expect([queue.poll(), queue.poll(), queue.poll(), queue.poll()]).toEqual([9, 7, 3, 1]);
  });

  it("starts from an iterable", () => {
    const queue = priorityQueue<number>([5, 2, 8, 1]);
    expect(queue.poll()).toBe(1);
    expect(queue.size).toBe(3);
  });
});
