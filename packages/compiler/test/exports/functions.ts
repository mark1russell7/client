/**
 * The implementation of the fixture `fixture.d.ts`: the functions that the procedures of the
 * manifest start. The declarations stay a separate file, because they also hold the cases that do
 * not resolve (`broken` and `vanished`).
 */

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Tree {
  readonly name: string;
  readonly children: readonly Tree[];
}

type Side = "less" | "greater" | "two-sided";

interface Shape {
  area(): number;
}

interface Handler {
  readonly name: string;
  readonly run: (value: number) => number;
}

interface Note {
  readonly text: string;
  readonly extra: string | undefined;
}

export class Counter {
  count = 0;
  add(value: number): void {
    this.count += value;
  }
}

export const LIMIT = 10;

export function add(a: number, b: number): number {
  return a + b;
}

export function minus(a: number, b: number): number {
  return a - b;
}

export function above(value: number, limit: number): boolean {
  return value > limit;
}

export function norm(point: Point, options: { readonly level?: number } = {}): number {
  return Math.hypot(point.x, point.y) * (options.level ?? 1);
}

export function total(...values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

export function depth(tree: Tree): number {
  return 1 + Math.max(0, ...tree.children.map(depth));
}

export function pair(word: string): [string, number] {
  return [word, word.length];
}

export function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

export async function greet(name: string, loud = false): Promise<string> {
  return loud ? `HELLO ${name.toUpperCase()}` : `hello ${name}`;
}

export function nothing(): void {}

export function flip(side: Side | null): Side | null {
  return side === "less" ? "greater" : side === "greater" ? "less" : side;
}

export function strict(): "yes" {
  return "yes";
}

export function keys(map: Map<string, number>): number {
  return map.size;
}

export function apply(values: readonly number[], fn: (value: number) => number): number[] {
  return values.map(fn);
}

export function sortBy(values: readonly number[], options: { readonly compare: (a: number, b: number) => number }): number[] {
  return [...values].sort(options.compare);
}

export function findIndex(values: readonly number[], predicate: (value: number, index: number) => boolean): number {
  return values.findIndex((value, index) => predicate(value, index));
}

export function choose(a: number, b: number, score?: (a: number, b: number) => number | undefined): number {
  const value = score?.(a, b);
  return value === undefined ? -1 : value;
}

export function useHandler(handler: Handler, value: number): number {
  return handler.run(value);
}

export function counter(): Counter {
  return new Counter();
}

export function parse(text: string, radix = 10): number {
  return Number.parseInt(text, radix);
}

export function big(value: bigint): bigint {
  return value * 2n;
}

export function broken(): number {
  return 0;
}

export function identity(value: unknown): unknown {
  return value;
}

export function fail(message: string): never {
  throw new Error(message);
}

export function toggle(on: boolean): boolean {
  return !on;
}

export function pick(value: string | number, when: true | "auto"): string | number {
  return when === true ? value : String(value);
}

export function measure(shape: Shape): number {
  return shape.area();
}

export function read(note: Note): string {
  return note.extra === undefined ? note.text : `${note.text} ${note.extra}`;
}

export function unset(): number {
  return 0;
}

export function lookup(key: string): [string, undefined] {
  return [key, undefined];
}
