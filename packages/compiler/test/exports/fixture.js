export class Counter { count = 0; add(value) { this.count += value; } }
export const LIMIT = 10;
export function add(a, b) { return a + b; }
export function norm(point, options = {}) { return Math.hypot(point.x, point.y) * (options.level ?? 1); }
export function total(...values) { return values.reduce((s, v) => s + v, 0); }
export function depth(tree) { return 1 + Math.max(0, ...tree.children.map(depth)); }
export function pair(word) { return [word, word.length]; }
export function first(items) { return items[0]; }
export async function greet(name, loud = false) { return loud ? `HELLO ${name.toUpperCase()}` : `hello ${name}`; }
export function nothing() {}
export function flip(side) { return side === "less" ? "greater" : side === "greater" ? "less" : side; }
export function strict() { return "yes"; }
export function keys(map) { return map.size; }
export function apply(values, fn) { return values.map(fn); }
export function sortBy(values, options) { return [...values].sort(options.compare); }
export function counter() { return new Counter(); }
export function parse(text, radix = 10) { return Number.parseInt(text, radix); }
export function big(value) { return value * 2n; }
export function broken() { return 0; }
