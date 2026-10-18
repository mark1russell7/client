/**
 * The keys of an ordered list (Graph's split, wave 2, W1): fractional indexing with base-62 keys. A
 * key is a string. Each item of the list keeps one, and the list sorts by it. An item that moves
 * between two others gets a key between theirs, so a move writes one item and no other.
 *
 * - A key has an integer part and a fraction part. The first character of the integer part gives its
 *   length. An insertion at an end changes the integer part, so the keys stay short. An insertion
 *   between two keys uses the fraction part, which can grow without a limit: the keys never run out,
 *   and the list needs no rebalance.
 * - Compare two keys by the code units of the strings (`a < b`), never with `localeCompare`.
 * - Two writers that move items into the same gap at the same time can get the same key. Sort by the
 *   key, then by the id of the item, so each reader sees one order.
 *
 * The algorithm is the one of the `fractional-indexing` package of Rocicorp (CC0), after the article
 * "Implementing Fractional Indexing" of David Greenspan.
 */

/** The digits of a key, in ascending order of their code units. */
export const KEY_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const ZERO = KEY_DIGITS[0]!;
const LAST = KEY_DIGITS[KEY_DIGITS.length - 1]!;
/** The smallest integer part. No key comes before it. */
const SMALLEST_INTEGER = `A${ZERO.repeat(26)}`;

function invalid(message: string): RangeError {
  return new RangeError(message);
}

/** The length of the integer part that starts with a head character: a to z give 2 to 27, Z to A give 2 to 27. */
function integerLength(head: string): number {
  if (head >= "a" && head <= "z") return head.charCodeAt(0) - "a".charCodeAt(0) + 2;
  if (head >= "A" && head <= "Z") return "Z".charCodeAt(0) - head.charCodeAt(0) + 2;
  throw invalid(`A key cannot start with "${head}"`);
}

function integerPart(key: string): string {
  const length = integerLength(key[0] ?? "");
  if (length > key.length) throw invalid(`The key "${key}" is too short for its integer part`);
  return key.slice(0, length);
}

function validateKey(key: string): void {
  if (typeof key !== "string" || key === "") throw invalid("A key is a string that is not empty");
  for (const c of key) if (!KEY_DIGITS.includes(c)) throw invalid(`The key "${key}" has a character that is no digit of a key`);
  if (key === SMALLEST_INTEGER) throw invalid(`The key "${key}" is reserved`);
  const fraction = key.slice(integerPart(key).length);
  if (fraction.endsWith(ZERO)) throw invalid(`The fraction part of the key "${key}" ends with ${ZERO}`);
}

/** A fraction strictly between two fractions. `b` null is the end. Neither one ends with the zero digit. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? KEY_DIGITS.indexOf(a[0]!) : 0;
  const digitB = b !== null ? KEY_DIGITS.indexOf(b[0]!) : KEY_DIGITS.length;
  if (digitB - digitA > 1) return KEY_DIGITS[Math.round((digitA + digitB) / 2)]!;
  // The first digits are next to each other
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return KEY_DIGITS[digitA]! + midpoint(a.slice(1), null);
}

function incrementInteger(x: string): string | null {
  const [head, ...digits] = x.split("") as [string, ...string[]];
  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i--) {
    const d = KEY_DIGITS.indexOf(digits[i]!) + 1;
    if (d === KEY_DIGITS.length) digits[i] = ZERO;
    else {
      digits[i] = KEY_DIGITS[d]!;
      carry = false;
    }
  }
  if (!carry) return head + digits.join("");
  if (head === "Z") return `a${ZERO}`;
  if (head === "z") return null;
  const next = String.fromCharCode(head.charCodeAt(0) + 1);
  if (next > "a") digits.push(ZERO);
  else digits.pop();
  return next + digits.join("");
}

function decrementInteger(x: string): string | null {
  const [head, ...digits] = x.split("") as [string, ...string[]];
  let borrow = true;
  for (let i = digits.length - 1; borrow && i >= 0; i--) {
    const d = KEY_DIGITS.indexOf(digits[i]!) - 1;
    if (d === -1) digits[i] = LAST;
    else {
      digits[i] = KEY_DIGITS[d]!;
      borrow = false;
    }
  }
  if (!borrow) return head + digits.join("");
  if (head === "a") return `Z${LAST}`;
  if (head === "A") return null;
  const next = String.fromCharCode(head.charCodeAt(0) - 1);
  if (next < "Z") digits.push(LAST);
  else digits.pop();
  return next + digits.join("");
}

/**
 * This function gives a key strictly between two keys. Without `prev`, the key comes before `next`.
 * Without `next`, it comes after `prev`. Without both, it gives the first key of a list ("a0").
 *
 * @throws RangeError when a key is not valid, or when `prev` is not before `next`
 *
 * @example
 * ```ts
 * keyBetween(undefined, undefined); // "a0"
 * keyBetween("a0", undefined); // "a1", after a0
 * keyBetween("a0", "a1"); // "a0V"
 * ```
 */
export function keyBetween(prev: string | null | undefined, next: string | null | undefined): string {
  const a = prev ?? null;
  const b = next ?? null;
  if (a !== null) validateKey(a);
  if (b !== null) validateKey(b);
  if (a !== null && b !== null && a >= b) throw invalid(`The key "${a}" is not before the key "${b}"`);
  if (a === null) {
    if (b === null) return `a${ZERO}`;
    const ib = integerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) return ib + midpoint("", fb);
    if (ib < b) return ib;
    const decremented = decrementInteger(ib);
    if (decremented === null) throw invalid("No key comes before this one");
    return decremented;
  }
  const ia = integerPart(a);
  const fa = a.slice(ia.length);
  if (b === null) {
    const incremented = incrementInteger(ia);
    return incremented === null ? ia + midpoint(fa, null) : incremented;
  }
  const ib = integerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb);
  const incremented = incrementInteger(ia);
  if (incremented === null) throw invalid("No key comes after this one");
  if (incremented < b) return incremented;
  return ia + midpoint(fa, null);
}

/**
 * This function gives `count` keys in ascending order, strictly between two keys, for example to put
 * several items at one place, or to give keys to the items of a list for the first time.
 *
 * @throws RangeError as `keyBetween`, or when `count` is not an integer of 0 or more
 */
export function keysBetween(prev: string | null | undefined, next: string | null | undefined, count: number): string[] {
  if (!Number.isInteger(count) || count < 0) throw invalid(`A count of keys is an integer of 0 or more, not ${count}`);
  const a = prev ?? null;
  const b = next ?? null;
  if (count === 0) return [];
  if (count === 1) return [keyBetween(a, b)];
  if (b === null) {
    const keys = [keyBetween(a, null)];
    for (let i = 1; i < count; i++) keys.push(keyBetween(keys[i - 1]!, null));
    return keys;
  }
  if (a === null) {
    const keys = [keyBetween(null, b)];
    for (let i = 1; i < count; i++) keys.push(keyBetween(null, keys[i - 1]!));
    return keys.reverse();
  }
  const half = Math.floor(count / 2);
  const middle = keyBetween(a, b);
  return [...keysBetween(a, middle, half), middle, ...keysBetween(middle, b, count - half - 1)];
}

/** The options of `isValidKey`. */
export interface KeyCheckOptions {
  /** The longest key that the check accepts. The default is 1024 characters. */
  readonly maxLength?: number;
}

/**
 * This function tells if a value is a valid key, for example a key that a client writes. A key that
 * is longer than `maxLength` is not valid.
 */
export function isValidKey(key: unknown, options: KeyCheckOptions = {}): key is string {
  if (typeof key !== "string" || key.length > (options.maxLength ?? 1024)) return false;
  try {
    validateKey(key);
    return true;
  } catch {
    return false;
  }
}

/** An item of an ordered list: its id and its key. */
export interface KeyedItem {
  readonly id: string;
  readonly key: string;
}

/**
 * This function gives the writes of a move: the new key of the item that moves, and new keys for the
 * neighbors that need them. Give the other items of the list in order (by key, then by id), without
 * the item that moves, and the index of the drop from 0 to their number (`dropIndex`).
 *
 * Two writers can give two items one key. A drop between two such items has no key between them, so
 * the helper first gives new keys to the items after the drop that have the key of the item before
 * it. Each write is `{ id, key }`. The writes of the neighbors come first, and the write of the item
 * that moves comes last.
 *
 * @throws RangeError when the index is outside the list, when the list holds the item that moves, or
 * when a key is not valid
 *
 * @example
 * ```ts
 * const index = dropIndex(pointer, others.map(centerOf));
 * for (const { id, key } of keysForDrop(others, index, dragged.id)) await save(id, { rank: key });
 * ```
 */
export function keysForDrop(items: readonly KeyedItem[], index: number, movingId: string): Array<{ id: string; key: string }> {
  if (!Number.isInteger(index) || index < 0 || index > items.length) throw invalid(`The index ${index} is outside the list of ${items.length} items`);
  if (items.some((item) => item.id === movingId)) throw invalid(`The list holds the item that moves (${movingId})`);
  const prev = items[index - 1]?.key ?? null;
  // The items from the index on that do not come after the item before the drop need new keys
  let end = index;
  while (end < items.length && prev !== null && items[end]!.key <= prev) end++;
  const writes: Array<{ id: string; key: string }> = [];
  if (end > index) {
    const keys = keysBetween(prev, items[end]?.key ?? null, end - index);
    for (let i = index; i < end; i++) writes.push({ id: items[i]!.id, key: keys[i - index]! });
  }
  const next = writes.length > 0 ? writes[0]!.key : (items[index]?.key ?? null);
  writes.push({ id: movingId, key: keyBetween(prev, next) });
  return writes;
}

/** The order of two keys: the code units of the strings, as the keys need (never `localeCompare`). */
export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A point, for example the center of an item on the screen. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * This function gives the index at which a point goes among the items of a list on the screen, in
 * reading order: the rows from top to bottom, and each row from left to right. It is the index of the
 * first item whose center comes after the point, from 0 to the number of items. A center within
 * `rowTolerance` of the point on the vertical axis is in the row of the point.
 *
 * Give the centers in reading order, the same order as the keys, and without the item that moves.
 *
 * @example
 * ```ts
 * const index = dropIndex(pointer, others.map(centerOf));
 * const key = keyBetween(keys[index - 1], keys[index]);
 * ```
 */
export function dropIndex(point: Point, centers: readonly Point[], rowTolerance = 24): number {
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i]!;
    if (point.y < c.y - rowTolerance) return i;
    if (Math.abs(point.y - c.y) <= rowTolerance && point.x < c.x) return i;
  }
  return centers.length;
}
