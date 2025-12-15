/**
 * LinkedList implementation - A doubly-linked list.
 *
 * Provides O(1) insertion/removal at both ends and at known positions.
 * Slower random access O(n) compared to ArrayList.
 * Mirrors java.util.LinkedList.
 *
 * @example
 * const list = linkedList<number>()
 * list.addFirst(1)
 * list.addLast(2)
 * list.add(3)
 */

import type { List } from "../interfaces/list.js";
import type { Deque } from "../interfaces/queue.js";
import type { Eq, Compare } from "../core/traits.js";
import { defaultEq, defaultCompare } from "../utils/defaults.js";

/**
 * Internal node structure for the linked list.
 */
class Node<T> {
  constructor(
    public value: T,
    public prev: Node<T> | null = null,
    public next: Node<T> | null = null
  ) {}
}

/**
 * Options for creating a LinkedList.
 */
export interface LinkedListOptions<T> {
  /**
   * Equality function for comparing elements.
   * @default defaultEq (===)
   */
  eq?: Eq<T>;
}

/**
 * LinkedList<T> - Doubly-linked list implementation.
 *
 * Efficient for:
 * - Insertion/removal at ends: O(1)
 * - Insertion/removal at known position: O(1)
 * - Sequential iteration: O(n)
 *
 * Not efficient for:
 * - Random access by index: O(n)
 * - Search: O(n)
 *
 * Implements both List and Deque interfaces.
 */
export class LinkedList<T> implements List<T>, Deque<T> {
  private _head: Node<T> | null = null;
  private _tail: Node<T> | null = null;
  private _size: number = 0;
  private readonly _eq: Eq<T>;

  constructor(options: LinkedListOptions<T> = {}) {
    const { eq = defaultEq } = options;
    this._eq = eq;
  }

  // ========================================================================
  // Size
  // ========================================================================

  get size(): number {
    return this._size;
  }

  get isEmpty(): boolean {
    return this._size === 0;
  }

  get eq(): Eq<T> {
    return this._eq;
  }

  // ========================================================================
  // Deque operations (both ends)
  // ========================================================================

  addFirst(element: T): void {
    const newNode = new Node(element, null, this._head);
    if (this._head) {
      this._head.prev = newNode;
    }
    this._head = newNode;
    if (!this._tail) {
      this._tail = newNode;
    }
    this._size++;
  }

  addLast(element: T): void {
    const newNode = new Node(element, this._tail, null);
    if (this._tail) {
      this._tail.next = newNode;
    }
    this._tail = newNode;
    if (!this._head) {
      this._head = newNode;
    }
    this._size++;
  }

  removeFirst(): T {
    if (!this._head) {
      throw new Error("List is empty");
    }
    return this.pollFirst()!;
  }

  removeLast(): T {
    if (!this._tail) {
      throw new Error("List is empty");
    }
    return this.pollLast()!;
  }

  pollFirst(): T | undefined {
    if (!this._head) return undefined;

    const value = this._head.value;
    this._head = this._head.next;

    if (this._head) {
      this._head.prev = null;
    } else {
      this._tail = null;
    }

    this._size--;
    return value;
  }

  pollLast(): T | undefined {
    if (!this._tail) return undefined;

    const value = this._tail.value;
    this._tail = this._tail.prev;

    if (this._tail) {
      this._tail.next = null;
    } else {
      this._head = null;
    }

    this._size--;
    return value;
  }

  peekFirst(): T {
    if (!this._head) {
      throw new Error("List is empty");
    }
    return this._head.value;
  }

  peekLast(): T {
    if (!this._tail) {
      throw new Error("List is empty");
    }
    return this._tail.value;
  }

  peekFirstOrUndefined(): T | undefined {
    return this._head?.value;
  }

  peekLastOrUndefined(): T | undefined {
    return this._tail?.value;
  }

  offerFirst(element: T): boolean {
    this.addFirst(element);
    return true;
  }

  offerLast(element: T): boolean {
    this.addLast(element);
    return true;
  }

  // ========================================================================
  // Stack operations (LIFO)
  // ========================================================================

  push(element: T): void {
    this.addFirst(element);
  }

  pop(): T {
    return this.removeFirst();
  }

  // ========================================================================
  // Queue operations (FIFO)
  // ========================================================================

  offer(element: T): boolean {
    return this.offerLast(element);
  }

  poll(): T {
    return this.removeFirst();
  }

  peek(): T {
    return this.peekFirst();
  }

  peekOrUndefined(): T | undefined {
    return this.peekFirstOrUndefined();
  }

  pollOrUndefined(): T | undefined {
    return this.pollFirst();
  }

  enqueue(element: T): boolean {
    return this.offer(element);
  }

  dequeue(): T {
    return this.poll();
  }

  // ========================================================================
  // List operations
  // ========================================================================

  get(index: number): T {
    const node = this.getNode(index);
    return node.value;
  }

  set(index: number, element: T): T {
    const node = this.getNode(index);
    const old = node.value;
    node.value = element;
    return old;
  }

  insert(index: number, element: T): void {
    if (index < 0 || index > this._size) {
      throw new RangeError(`Index ${index} out of bounds for size ${this._size}`);
    }

    if (index === 0) {
      this.addFirst(element);
      return;
    }

    if (index === this._size) {
      this.addLast(element);
      return;
    }

    const nextNode = this.getNode(index);
    const prevNode = nextNode.prev!;
    const newNode = new Node(element, prevNode, nextNode);

    prevNode.next = newNode;
    nextNode.prev = newNode;
    this._size++;
  }

  insertAll(index: number, other: Iterable<T>): boolean {
    if (index < 0 || index > this._size) {
      throw new RangeError(`Index ${index} out of bounds for size ${this._size}`);
    }

    const elements = Array.from(other);
    if (elements.length === 0) return false;

    for (let i = 0; i < elements.length; i++) {
      this.insert(index + i, elements[i]!);
    }

    return true;
  }

  removeAt(index: number): T {
    const node = this.getNode(index);
    return this.unlinkNode(node);
  }

  removeRange(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || toIndex > this._size || fromIndex > toIndex) {
      throw new RangeError(`Invalid range [${fromIndex}, ${toIndex})`);
    }

    for (let i = fromIndex; i < toIndex; i++) {
      this.removeAt(fromIndex);
    }
  }

  indexOf(element: T, fromIndex: number = 0): number {
    let index = 0;
    let node = this._head;

    while (node) {
      if (index >= fromIndex && this._eq(node.value, element)) {
        return index;
      }
      node = node.next;
      index++;
    }

    return -1;
  }

  lastIndexOf(element: T, fromIndex?: number): number {
    const start = fromIndex !== undefined ? fromIndex : this._size - 1;
    let index = this._size - 1;
    let node = this._tail;

    while (node && index >= 0) {
      if (index <= start && this._eq(node.value, element)) {
        return index;
      }
      node = node.prev;
      index--;
    }

    return -1;
  }

  first(): T {
    return this.peekFirst();
  }

  last(): T {
    return this.peekLast();
  }

  shift(): T {
    return this.removeFirst();
  }

  unshift(element: T): void {
    this.addFirst(element);
  }

  // ========================================================================
  // Collection operations
  // ========================================================================

  add(element: T): boolean {
    this.addLast(element);
    return true;
  }

  addAll(other: Iterable<T>): boolean {
    let modified = false;
    for (const element of other) {
      this.addLast(element);
      modified = true;
    }
    return modified;
  }

  contains(element: T): boolean {
    return this.indexOf(element) !== -1;
  }

  containsAll(other: Iterable<T>): boolean {
    for (const element of other) {
      if (!this.contains(element)) return false;
    }
    return true;
  }

  remove(element: T): boolean {
    let node = this._head;

    while (node) {
      if (this._eq(node.value, element)) {
        this.unlinkNode(node);
        return true;
      }
      node = node.next;
    }

    return false;
  }

  removeAll(other: Iterable<T>): boolean {
    const toRemove = new Set(other);
    let modified = false;

    for (const element of toRemove) {
      while (this.remove(element)) {
        modified = true;
      }
    }

    return modified;
  }

  retainAll(other: Iterable<T>): boolean {
    const toRetain = new Set(other);
    let node = this._head;
    let modified = false;

    while (node) {
      const next = node.next;
      let shouldRetain = false;

      for (const retainElement of toRetain) {
        if (this._eq(node.value, retainElement)) {
          shouldRetain = true;
          break;
        }
      }

      if (!shouldRetain) {
        this.unlinkNode(node);
        modified = true;
      }

      node = next;
    }

    return modified;
  }

  clear(): void {
    this._head = null;
    this._tail = null;
    this._size = 0;
  }

  // ========================================================================
  // Sorting and reversing
  // ========================================================================

  sort(compare: Compare<T> = defaultCompare): void {
    if (this._size <= 1) return;

    // Convert to array, sort, rebuild list
    const array = this.toArray();
    array.sort(compare);

    this.clear();
    for (const element of array) {
      this.addLast(element);
    }
  }

  reverse(): void {
    if (this._size <= 1) return;

    let node = this._head;
    this._head = this._tail;
    this._tail = node;

    while (node) {
      const next = node.next;
      node.next = node.prev;
      node.prev = next;
      node = next;
    }
  }

  // ========================================================================
  // Views
  // ========================================================================

  subList(fromIndex: number, toIndex: number): List<T> {
    if (fromIndex < 0 || toIndex > this._size || fromIndex > toIndex) {
      throw new RangeError(`Invalid range [${fromIndex}, ${toIndex})`);
    }

    const sub = new LinkedList<T>({ eq: this._eq });
    let index = 0;
    let node = this._head;

    while (node && index < toIndex) {
      if (index >= fromIndex) {
        sub.addLast(node.value);
      }
      node = node.next;
      index++;
    }

    return sub;
  }

  // ========================================================================
  // Iteration
  // ========================================================================

  *[Symbol.iterator](): Iterator<T> {
    let node = this._head;
    while (node) {
      yield node.value;
      node = node.next;
    }
  }

  forEach(action: (element: T, index: number) => void): void {
    let index = 0;
    let node = this._head;

    while (node) {
      action(node.value, index);
      node = node.next;
      index++;
    }
  }

  toArray(): T[] {
    const result: T[] = [];
    let node = this._head;

    while (node) {
      result.push(node.value);
      node = node.next;
    }

    return result;
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private getNode(index: number): Node<T> {
    if (index < 0 || index >= this._size) {
      throw new RangeError(`Index ${index} out of bounds for size ${this._size}`);
    }

    // Optimize: start from head or tail depending on index
    if (index < this._size / 2) {
      // Start from head
      let node = this._head!;
      for (let i = 0; i < index; i++) {
        node = node.next!;
      }
      return node;
    } else {
      // Start from tail
      let node = this._tail!;
      for (let i = this._size - 1; i > index; i--) {
        node = node.prev!;
      }
      return node;
    }
  }

  private unlinkNode(node: Node<T>): T {
    const value = node.value;

    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this._head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this._tail = node.prev;
    }

    this._size--;
    return value;
  }

  // ========================================================================
  // Inspection
  // ========================================================================

  toString(): string {
    return `LinkedList[${this.toArray().join(", ")}]`;
  }
}

/**
 * Factory function to create a LinkedList.
 *
 * @example
 * const list = linkedList<number>()
 * const listFromArray = linkedList([1, 2, 3])
 */
export function linkedList<T>(
  optionsOrElements?: LinkedListOptions<T> | Iterable<T>
): LinkedList<T> {
  // Check if it's an iterable (not options)
  if (optionsOrElements && Symbol.iterator in optionsOrElements) {
    const list = new LinkedList<T>();
    list.addAll(optionsOrElements as Iterable<T>);
    return list;
  }

  return new LinkedList<T>(optionsOrElements as LinkedListOptions<T>);
}
