/**
 * The implementation of the fixture `fixture.d.ts`: the functions that the procedures of the
 * manifest start. The declarations stay a separate file, because they also hold the cases that do
 * not resolve (`broken` and `vanished`).
 */

interface Point {
  readonly x: number;
  readonly y: number;
}

type MaybeSide = "less" | "greater" | "two-sided" | undefined;

type Spec = { readonly kind: "fixed"; readonly value: number } | { readonly kind: "mix"; readonly parts: readonly Spec[] };

interface Grow<T> {
  readonly value: T;
  readonly next: Grow<T[]>;
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

export function weight(spec: Spec): number {
  return spec.kind === "fixed" ? 1 : spec.parts.reduce((sum, part) => sum + weight(part), 0);
}

export function sideOf(sign: number): MaybeSide {
  return sign > 0 ? "greater" : sign < 0 ? "less" : undefined;
}

export function grow(value: Grow<number>): number {
  return value.value;
}

interface Die {
  readonly seed: number;
  roll(): number;
}

interface Coin {
  flip(): boolean;
}

export function die(seed: number, faces?: Map<number, number>): Die {
  let state = seed;
  return {
    seed,
    roll: () => {
      state = (state * 31 + 7) % 6;
      return faces?.get(state) ?? state + 1;
    },
  };
}

export function rolls(count: number, made: Die): number[] {
  return Array.from({ length: count }, () => made.roll());
}

export function maybeRoll(made?: Die): number {
  return made?.roll() ?? 0;
}

export function coin(seed: number): Coin {
  return { flip: () => seed % 2 === 0 };
}

export function fairCoin(seed: number): Coin {
  return { flip: () => seed % 2 === 1 };
}

export function flips(made: Coin): boolean {
  return made.flip();
}

export function curried(make: (seed: number) => () => number): number {
  return make(1)();
}

export function scale(values: readonly number[], factor: number | ((value: number) => number)): number[] {
  return values.map((value) => (typeof factor === "function" ? factor(value) : value * factor));
}

export function chain(value: number, steps: readonly ((value: number) => number)[]): number {
  return steps.reduce((current, step) => step(current), value);
}

export function sizes(items: readonly { readonly name: string; readonly size: number }[], key: (item: { readonly name: string; readonly size: number }) => number): number[] {
  return items.map(key);
}

export function stamp(record: { readonly at: bigint }): number {
  return Number(record.at);
}

export function either(value: { readonly seed: number } | { flip(): boolean }): number {
  return "seed" in value ? value.seed : 0;
}

export function bag(items: Set<number>): { take(): number } {
  return { take: () => items.values().next().value ?? 0 };
}

export function draw(made: { take(): number }): number {
  return made.take();
}

export function deck(seed: number, ...cards: number[]): { deal(): number } {
  return { deal: () => cards[0] ?? seed };
}

export function deal(made: { deal(): number }): number {
  return made.deal();
}
