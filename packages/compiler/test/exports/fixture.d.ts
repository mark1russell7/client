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

export interface Options {
  readonly side?: Side;
  readonly level?: number;
  readonly labels?: Readonly<Record<string, string>>;
}

/** A shape: a named type with a method is not JSON. */
export interface Shape {
  area(): number;
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
/** A count of the keys of a map: a Map is not JSON. */
export declare function keys(map: Map<string, number>): number;
/** A callback is not JSON. */
export declare function apply(values: readonly number[], fn: (value: number) => number): number[];
/** An option with a callback is not JSON. */
export declare function sortBy(values: readonly number[], options: { readonly compare: (a: number, b: number) => number }): number[];
/** A counter: the output is a class instance. */
export declare function counter(): Counter;
/** Two signatures. */
export declare function parse(text: string): number;
export declare function parse(text: string, radix: number): number;
/** A big number is not JSON. */
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
/** A tuple with an undefined item: JSON gives null for it. */
export declare function lookup(key: string): [string, undefined];
