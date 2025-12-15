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
export declare class LinkedList<T> implements List<T>, Deque<T> {
    private _head;
    private _tail;
    private _size;
    private readonly _eq;
    constructor(options?: LinkedListOptions<T>);
    get size(): number;
    get isEmpty(): boolean;
    get eq(): Eq<T>;
    addFirst(element: T): void;
    addLast(element: T): void;
    removeFirst(): T;
    removeLast(): T;
    pollFirst(): T | undefined;
    pollLast(): T | undefined;
    peekFirst(): T;
    peekLast(): T;
    peekFirstOrUndefined(): T | undefined;
    peekLastOrUndefined(): T | undefined;
    offerFirst(element: T): boolean;
    offerLast(element: T): boolean;
    push(element: T): void;
    pop(): T;
    offer(element: T): boolean;
    poll(): T;
    peek(): T;
    peekOrUndefined(): T | undefined;
    pollOrUndefined(): T | undefined;
    enqueue(element: T): boolean;
    dequeue(): T;
    get(index: number): T;
    set(index: number, element: T): T;
    insert(index: number, element: T): void;
    insertAll(index: number, other: Iterable<T>): boolean;
    removeAt(index: number): T;
    removeRange(fromIndex: number, toIndex: number): void;
    indexOf(element: T, fromIndex?: number): number;
    lastIndexOf(element: T, fromIndex?: number): number;
    first(): T;
    last(): T;
    shift(): T;
    unshift(element: T): void;
    add(element: T): boolean;
    addAll(other: Iterable<T>): boolean;
    contains(element: T): boolean;
    containsAll(other: Iterable<T>): boolean;
    remove(element: T): boolean;
    removeAll(other: Iterable<T>): boolean;
    retainAll(other: Iterable<T>): boolean;
    clear(): void;
    sort(compare?: Compare<T>): void;
    reverse(): void;
    subList(fromIndex: number, toIndex: number): List<T>;
    [Symbol.iterator](): Iterator<T>;
    forEach(action: (element: T, index: number) => void): void;
    toArray(): T[];
    private getNode;
    private unlinkNode;
    toString(): string;
}
/**
 * Factory function to create a LinkedList.
 *
 * @example
 * const list = linkedList<number>()
 * const listFromArray = linkedList([1, 2, 3])
 */
export declare function linkedList<T>(optionsOrElements?: LinkedListOptions<T> | Iterable<T>): LinkedList<T>;
//# sourceMappingURL=linked-list.d.ts.map