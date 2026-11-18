/** The fixture of the exports generator: one function for each case of a type. */

import type { Missing } from "./missing.js";

/** A point on a plane. */
export interface Point {
  /** The x coordinate. */
  readonly x: number;
  readonly y: number;
}

/** A tree of names: a recursive type. */
export interface Tree {
  readonly name: string;
  readonly children: readonly Tree[];
}

export type Side = "less" | "greater" | "two-sided";

/** A side or no side: a named union with an undefined member. */
export type MaybeSide = Side | undefined;

/** A distribution: a named union with a member that holds the union again. */
export type Spec = { readonly kind: "fixed"; readonly value: number } | { readonly kind: "mix"; readonly parts: readonly Spec[] };

/** A type that grows at each level: each level is a new type, so it has no end. */
export interface Grow<T> {
  readonly value: T;
  readonly next: Grow<T[]>;
}

export interface Options {
  readonly side?: Side;
  readonly level?: number;
  readonly labels?: Readonly<Record<string, string>>;
}

/** A shape: a named type with a method is not JSON. */
export interface Shape {
  area(): number;
}

/** A handler: a named type with a callback. */
export interface Handler {
  readonly name: string;
  readonly run: (value: number) => number;
}

/** A note: a property with an undefined member can be absent. */
export interface Note {
  readonly text: string;
  readonly extra: string | undefined;
}

/** A class: a candidate for a handle. */
export declare class Counter {
  count: number;
  add(value: number): void;
}

export declare const LIMIT = 10;

/**
 * The sum of two numbers.
 *
 * The second paragraph is not in the description.
 * @param a The first number.
 */
export declare function add(a: number, b: number): number;
/** The difference of two numbers. */
export declare function minus(a: number, b: number): number;
/** True when a number is over a limit. */
export declare function above(value: number, limit: number): boolean;
/** The distance of a point from the origin, at a level. */
export declare function norm(point: Point, options?: Options): number;
/** The sum of each number. */
export declare function total(...values: number[]): number;
/** The depth of a tree. */
export declare function depth(tree: Tree): number;
/** A pair of a word and its length. */
export declare function pair(word: string): [string, number];
/** The first item of a list. */
export declare function first<T>(items: readonly T[]): T | undefined;
/** A greeting, later. */
export declare function greet(name: string, loud?: boolean): Promise<string>;
/** Nothing. */
export declare function nothing(): void;
/** A choice of a side, or null. */
export declare function flip(side: Side | null): Side | null;
/** A literal flag. */
export declare function strict(flag: true, mode: 1 | 2): "yes";
/** A count of the keys of a map: a Map is a list of entries in JSON. */
export declare function keys(map: Map<string, number>): number;
/** A callback with JSON values: a sub-program gives it. */
export declare function apply(values: readonly number[], fn: (value: number) => number): number[];
/** An option with a callback: a sub-program gives it. */
export declare function sortBy(values: readonly number[], options: { readonly compare: (a: number, b: number) => number }): number[];
/** A callback with two parameters. */
export declare function findIndex(values: readonly number[], predicate: (value: number, index: number) => boolean): number;
/** An optional callback whose result can be undefined: a sub-program gives undefined for null. */
export declare function choose(a: number, b: number, score?: (a: number, b: number) => number | undefined): number;
/** A callback in a named type. */
export declare function useHandler(handler: Handler, value: number): number;
/** A named type with a callback is not JSON in an output. */
export declare function handlerOf(name: string): Handler;
/** A callback that gives a promise: a sub-program gives its value at once, so it cannot. */
export declare function later(values: readonly number[], fn: (value: number) => Promise<number>): Promise<number[]>;
/** A callback with no value. */
export declare function each(values: readonly number[], fn: (value: number) => void): void;
/** A generic callback. */
export declare function twice(fn: <T>(value: T) => T): number;
/** A callback with a map parameter: the sub-program gets the list of entries. */
export declare function sizeOf(fn: (map: Map<string, number>) => number): number;
/** A counter: the output is a class instance, so a handle. */
export declare function counter(): Counter;
/**
 * The count of a counter: the input is a handle.
 * @param counter The counter.
 */
export declare function countOf(counter: Counter): number;
/** Add to a counter: a handle input with a JSON input. */
export declare function bump(counter: Counter, by: number): void;
/** A counter or nothing: a handle or null. */
export declare function maybeCounter(make: boolean): Counter | undefined;
/** A counter in an object: a class instance below the top is not a handle. */
export declare function boxed(): { readonly counter: Counter };
/** Two signatures. */
export declare function parse(text: string): number;
export declare function parse(text: string, radix: number): number;
/** Twice a big number: a bigint is a decimal string in JSON. */
export declare function big(value: bigint): bigint;
/** A type that does not resolve: the generator fails closed. */
export declare function broken(value: Missing): number;
/** Any value: unknown is any JSON value. */
export declare function identity(value: unknown): unknown;
/** No output: never is not JSON. */
export declare function fail(message: string): never;
/** A flag. */
export declare function toggle(on: boolean): boolean;
/** A union of types, and a union of a literal flag and a word. */
export declare function pick(value: string | number, when: true | "auto"): string | number;
/** The area of a shape. */
export declare function measure(shape: Shape): number;
/** The text of a note. */
export declare function read(note: Note): string;
/** An undefined input is not JSON. */
export declare function unset(value: undefined): number;
/** A re-export from a module that does not resolve: the generator fails closed. */
export { vanished } from "./missing.js";
/** A tuple with an undefined item: JSON gives null for it. */
export declare function lookup(key: string): [string, undefined];
/** The number of fixed parts of a distribution. */
export declare function weight(spec: Spec): number;
/** The side of a sign, or undefined for zero. */
export declare function sideOf(sign: number): MaybeSide;
/** The first value of a type with no end. */
export declare function grow(value: Grow<number>): number;
/** A die with a seed: an object with a method, so it is not JSON. */
export interface Die {
  readonly seed: number;
  roll(): number;
}
/**
 * A die from a seed: the factory of a constructed input. The faces are a list of entries in JSON. The
 * clock is not JSON, so the input stops before it.
 */
export declare function die(seed: number, faces?: Map<number, number>, clock?: Date): Die;
/** The rolls of a die: a constructed input. */
export declare function rolls(count: number, die: Die): number[];
/** One roll, or 0 with no die: an optional constructed input. */
export declare function maybeRoll(die?: Die): number;
/** A coin: two functions give it. */
export interface Coin {
  flip(): boolean;
}
/** A coin from a seed. */
export declare function coin(seed: number): Coin;
/** The other coin from a seed. */
export declare function fairCoin(seed: number): Coin;
/** One flip: the overlay names the factory of the coin. */
export declare function flips(coin: Coin): boolean;
/** A function parameter whose result is a function: a sub-program gives JSON, so it cannot give it. */
export declare function curried(make: (seed: number) => () => number): number;
/** A factor or a function of each value: a union with a sub-program. */
export declare function scale(values: readonly number[], factor: number | ((value: number) => number)): number[];
/** The steps of a value, in order: an array of sub-programs. */
export declare function chain(value: number, steps: readonly ((value: number) => number)[]): number;
/** An item with a name and a size. */
export interface Named {
  readonly name: string;
  readonly size: number;
}
/** The key of each item: a sub-program that reads the fields of its parameter. */
export declare function sizes(items: readonly Named[], key: (item: Named) => number): number[];
/** A bigint in a property: its decimal string. */
export declare function stamp(record: { readonly at: bigint }): number;
/** A union of two types that are not JSON: no factory makes it. */
export declare function either(value: Die | Coin): number;
/** A bag of numbers. Its factory takes a set: a list in JSON. */
export interface Bag {
  take(): number;
}
/** A bag from a set: the factory of a constructed input. */
export declare function bag(items: Set<number>): Bag;
/** One number of a bag: a constructed input with a set. */
export declare function draw(bag: Bag): number;
/** A deck of cards. */
export interface Deck {
  deal(): number;
}
/** A deck from a seed and cards: the input of the factory stops at the rest parameter. */
export declare function deck(seed: number, ...cards: number[]): Deck;
/** The first card of a deck: a constructed input. */
export declare function deal(deck: Deck): number;
/**
 * A value that is present: NonNullable of a type parameter is T & {}, each value but null.
 *
 * @param value - The value, or null. The generator removes the hyphen of TSDoc.
 */
export declare function present<T>(value: T | null | undefined): { readonly value: NonNullable<T> } | null;
/** A value of the type {}: each value but null and undefined. */
export declare function anything(value: {}): {};
/** NonNullable of a union with null: the union without null. */
export declare function known(value: NonNullable<string | number | null>): string;
/** The count of each word: a ReadonlyMap is a list of entries in JSON. */
export declare function tally(words: readonly string[]): ReadonlyMap<string, number>;
/** NonNullable of a constraint with null. */
export declare function definite<T extends string | null>(value: NonNullable<T>): string;
/** A lock. Its factory takes a date, so no factory makes it from JSON. */
export interface Lock {
  open(): boolean;
}
/** A lock from a date: a Date is not JSON, so this function is not a factory of a constructed input. */
export declare function lock(at: Date): Lock;
/** One opening of a lock: no factory makes the lock from JSON. */
export declare function opens(lock: Lock): boolean;
/** The sum of the values of an iterable: a list in JSON. */
export declare function sumOf(values: Iterable<number>): number;
/** The natural numbers below a limit: an iterable output is not JSON, because an iterable can have no end. */
export declare function naturals(limit: number): Iterable<number>;
/** A source of values: a named type with an iterable. */
export interface Source {
  readonly values: Iterable<number>;
}
/** The sum of the values of a source: an input can hold an iterable. */
export declare function drain(source: Source): number;
/** A source below a limit: the iterable reaches the output through the named type. */
export declare function sourceOf(limit: number): Source;
/** The type of a number or of a stamp: a union with a bigint in a member. */
export declare function kindOf(value: number | { readonly at: bigint }): string;
/** Twice a bigint literal: its decimal string. */
export declare function exactly(value: -7n | 7n): bigint;
/** The distinct words: a ReadonlySet is a list in JSON. */
export declare function distinct(words: Iterable<string>): ReadonlySet<string>;
/** One more than the step of a bigint: a sub-program gives a bigint to the package. */
export declare function step(value: bigint, by: (value: bigint) => bigint): bigint;
/** A callback with an iterable parameter: the package can give an iterable with no end, so a sub-program cannot. */
export declare function feed(fn: (values: Iterable<number>) => number): number;
