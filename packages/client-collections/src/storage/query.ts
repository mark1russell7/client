/**
 * The query language of the collection storages: a selector, an order, a skip and a limit.
 *
 * A selector is JSON: a subset of the query selectors of MongoDB. It goes over the wire as it is,
 * so the procedure `collections.<name>.find` of `@procedures/client` and `query()` of each storage
 * take the same selector. A storage that can run a selector itself (for example a database) gives
 * the same result as `queryEntries()` of this module, which is the reference.
 *
 * The rules:
 * - A key of a selector is a field path, for example `"meta.kind"`. A number in a path is an
 *   index of an array, for example `"tags.0"`.
 * - A path through an array of objects looks into each object: `"items.name"` gives the name of
 *   each item.
 * - The value of a field path is a literal or an object of operators. A literal is a test for
 *   equality. A field whose value is an array also matches when one element is equal.
 * - The literal `null` also matches a missing field.
 * - The operators are `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists`,
 *   `$not`, `$regex` with `$options`, `$size`, `$all` and `$elemMatch`. The top of a selector also
 *   takes `$and`, `$or` and `$nor`. Another operator is an error, not a condition that is ignored.
 * - `$gt`, `$gte`, `$lt` and `$lte` compare only values of one type: numbers with numbers, strings
 *   with strings, and booleans with booleans.
 * - Two objects are equal when they have the same keys with equal values. The order of the keys
 *   does not change the result.
 * - A key whose value is `undefined` is not in the selector, as in JSON.
 *
 * This file has a copy in `@procedures/client` (`src/procedures/collection/query.ts`): the core
 * does not depend on this package (roadmap 3.3). The contract suite of `./testing` compares a
 * storage with `queryEntries()`, and it runs against the core procedure `find`, so the two copies
 * agree.
 */

//
// ═══ The types ═══
//

/**
 * A selector of a query. Each key is a field path with a condition, or one of the operators
 * `$and`, `$or` and `$nor`. An empty selector matches each item.
 */
export interface StorageSelector {
  /** Each selector of the list matches. */
  readonly $and?: readonly StorageSelector[] | undefined;
  /** One or more selectors of the list match. */
  readonly $or?: readonly StorageSelector[] | undefined;
  /** No selector of the list matches. */
  readonly $nor?: readonly StorageSelector[] | undefined;
  /** A condition on the value at a field path: a literal, or a `StorageFieldOperators` object. */
  readonly [path: string]: unknown;
}

/** The operators of a condition on one field path. All operators of one object must match. */
export interface StorageFieldOperators {
  /** The value is equal to this value. */
  readonly $eq?: unknown;
  /** The value is not equal to this value. */
  readonly $ne?: unknown;
  /** The value is more than this number, string or boolean. */
  readonly $gt?: number | string | boolean | null | undefined;
  /** The value is more than or equal to this number, string or boolean. */
  readonly $gte?: number | string | boolean | null | undefined;
  /** The value is less than this number, string or boolean. */
  readonly $lt?: number | string | boolean | null | undefined;
  /** The value is less than or equal to this number, string or boolean. */
  readonly $lte?: number | string | boolean | null | undefined;
  /** The value is equal to one value of the list. */
  readonly $in?: readonly unknown[] | undefined;
  /** The value is equal to no value of the list. */
  readonly $nin?: readonly unknown[] | undefined;
  /** True: the field has a value. False: the field is missing. */
  readonly $exists?: boolean | undefined;
  /** The operators of this object do not match. */
  readonly $not?: StorageFieldOperators | undefined;
  /** The value is a string that matches this regular expression. */
  readonly $regex?: string | undefined;
  /** The flags of `$regex`: `i`, `m`, `s` and `u`. */
  readonly $options?: string | undefined;
  /** The value is an array of this length. */
  readonly $size?: number | undefined;
  /** The value has each value of the list: an equal element, or an equal value. */
  readonly $all?: readonly unknown[] | undefined;
  /** The value is an array with one or more elements that match: a selector of objects, or operators. */
  readonly $elemMatch?: StorageSelector | StorageFieldOperators | undefined;
}

/** The direction of a sort key: 1 is ascending, -1 is descending. */
export type StorageSortDirection = 1 | -1;

/**
 * The order of a query: field paths with their directions. The first key sorts first. Items with
 * equal keys keep the order of the entries.
 */
export type StorageSort = Readonly<Record<string, StorageSortDirection>>;

/** The options of a query: the order, then the skip, then the limit. */
export interface StorageQueryOptions {
  /** The order of the result. Without it, the result has the order of the entries. */
  readonly sort?: StorageSort | undefined;
  /** The number of items to skip, after the sort. A whole number, 0 or more. */
  readonly skip?: number | undefined;
  /** The largest number of items in the result, after the skip. A whole number, 1 or more. */
  readonly limit?: number | undefined;
}

/**
 * The fields of a patch: a JSON Merge Patch (RFC 7386). Each field replaces the field of the item.
 * An object merges into an object field. `null` removes the field.
 */
export type StoragePatch = Readonly<Record<string, unknown>>;

//
// ═══ The values ═══
//

/** True for an object that is not an array and not null. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The keys of an object whose values are not `undefined`, as JSON keeps them. */
function definedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => value[key] !== undefined);
}

/** The rank of the type of a value in the order: null, numbers, strings, objects, arrays, booleans. */
function rankOf(value: unknown): number {
  if (value === null || value === undefined) return 0;
  switch (typeof value) {
    case "number":
      return 1;
    case "string":
      return 2;
    case "object":
      return Array.isArray(value) ? 4 : 3;
    case "boolean":
      return 5;
    default:
      return 6;
  }
}

/** The order of two primitive values of one type. */
function order<V extends number | string | boolean>(a: V, b: V): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * This function compares two JSON values in the order of the queries: `null` and a missing value
 * first, then numbers, strings, objects, arrays and booleans. Numbers compare by value, and strings
 * by their UTF-16 code units. Arrays compare element by element. Objects compare by their sorted
 * keys, then by the values of the keys.
 *
 * @returns A negative number when `a` comes first, a positive number when `b` comes first, or 0
 */
export function compareStorageValues(a: unknown, b: unknown): number {
  const rankA = rankOf(a);
  const rankB = rankOf(b);
  if (rankA !== rankB) return rankA < rankB ? -1 : 1;
  switch (rankA) {
    case 1:
      return order(a as number, b as number);
    case 2:
      return order(a as string, b as string);
    case 5:
      return order(a as boolean, b as boolean);
    case 4: {
      const left = a as unknown[];
      const right = b as unknown[];
      for (let index = 0; index < Math.min(left.length, right.length); index++) {
        const result = compareStorageValues(left[index], right[index]);
        if (result !== 0) return result;
      }
      return order(left.length, right.length);
    }
    case 3: {
      const left = a as Record<string, unknown>;
      const right = b as Record<string, unknown>;
      const leftKeys = definedKeys(left).sort(order);
      const rightKeys = definedKeys(right).sort(order);
      for (let index = 0; index < Math.min(leftKeys.length, rightKeys.length); index++) {
        const leftKey = leftKeys[index]!;
        const rightKey = rightKeys[index]!;
        if (leftKey !== rightKey) return order(leftKey, rightKey);
        const result = compareStorageValues(left[leftKey], right[rightKey]);
        if (result !== 0) return result;
      }
      return order(leftKeys.length, rightKeys.length);
    }
    default:
      return 0;
  }
}

/** True when two JSON values are equal. The order of the keys of an object does not count. */
function equal(a: unknown, b: unknown): boolean {
  return compareStorageValues(a, b) === 0;
}

//
// ═══ The field paths ═══
//

/** The values that a field path finds in an item, and true when one branch of the path is missing. */
interface Found {
  readonly values: unknown[];
  missing: boolean;
}

const INDEX = /^(?:0|[1-9][0-9]*)$/;

/** This function finds the values at a path. A path through an array of objects looks into each object. */
function lookup(item: unknown, path: readonly string[]): Found {
  const found: Found = { values: [], missing: false };
  walk(item, path, 0, found);
  return found;
}

function walk(value: unknown, path: readonly string[], index: number, found: Found): void {
  if (index === path.length) {
    if (value === undefined) found.missing = true;
    else found.values.push(value);
    return;
  }
  const key = path[index]!;
  if (Array.isArray(value)) {
    if (INDEX.test(key)) {
      const position = Number(key);
      if (position < value.length) walk(value[position], path, index + 1, found);
      else found.missing = true;
      return;
    }
    let objects = 0;
    for (const element of value) {
      if (!isObject(element)) continue;
      objects++;
      walk(element, path, index, found);
    }
    if (objects === 0) found.missing = true;
    return;
  }
  if (isObject(value) && Object.hasOwn(value, key)) walk(value[key], path, index + 1, found);
  else found.missing = true;
}

/** The values that a comparison examines: each value, and each element of a value that is an array. */
function candidates(found: Found): unknown[] {
  const result: unknown[] = [];
  for (const value of found.values) {
    result.push(value);
    if (Array.isArray(value)) result.push(...value);
  }
  return result;
}

/** The segments of a field path, or undefined after a problem. */
function pathOf(key: string, at: string, problems: string[]): string[] | undefined {
  const segments = key.split(".");
  if (segments.some((segment) => segment === "")) {
    problems.push(`${at}: the field path "${key}" has an empty part`);
    return undefined;
  }
  if (segments.some((segment) => segment.startsWith("$"))) {
    problems.push(`${at}: the field path "${key}" has a part that starts with $`);
    return undefined;
  }
  return segments;
}

//
// ═══ The compiler of a selector ═══
//

type Test = (found: Found) => boolean;
type Matcher = (item: unknown) => boolean;

const LOGICAL = new Set(["$and", "$or", "$nor"]);
const REGEX_FLAGS = /^(?!.*(.).*\1)[imsu]*$/;
const NEVER: Test = () => false;
const ALWAYS: Matcher = () => true;

/** The defined entries of an object, as JSON keeps them. */
function definedEntries(value: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(value).filter(([, entry]) => entry !== undefined);
}

/** True for an object of operators: each defined key starts with `$`. */
function isOperatorObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const keys = definedKeys(value);
  return keys.length > 0 && keys.every((key) => key.startsWith("$"));
}

/** The test of equality with a literal. `null` also matches a missing field. */
function equalTo(literal: unknown): Test {
  return (found) => (literal === null && found.missing) || candidates(found).some((value) => equal(value, literal));
}

/** True when two values have one type of the comparisons: number, string or boolean. */
function comparable(value: unknown, operand: unknown): boolean {
  const type = typeof operand;
  return typeof value === type && (type === "number" || type === "string" || type === "boolean");
}

/** The test of a comparison operator. */
function compareTo(operator: string, operand: unknown, at: string, problems: string[]): Test {
  if (operand === null) {
    // Only null is equal to null: $gte and $lte match null and a missing field
    return operator === "$gte" || operator === "$lte" ? equalTo(null) : NEVER;
  }
  if (typeof operand !== "number" && typeof operand !== "string" && typeof operand !== "boolean") {
    problems.push(`${at}.${operator} takes a number, a string, a boolean or null`);
    return NEVER;
  }
  const accept: (result: number) => boolean =
    operator === "$gt" ? (result) => result > 0 : operator === "$gte" ? (result) => result >= 0 : operator === "$lt" ? (result) => result < 0 : (result) => result <= 0;
  return (found) => candidates(found).some((value) => comparable(value, operand) && accept(compareStorageValues(value, operand)));
}

/** The test of a list operator: `$in`, `$nin` or `$all`. */
function listOf(operator: string, operand: unknown, at: string, problems: string[]): Test[] | undefined {
  if (!Array.isArray(operand)) {
    problems.push(`${at}.${operator} takes a list`);
    return undefined;
  }
  return operand.map((value, index) => {
    if (isOperatorObject(value)) {
      problems.push(`${at}.${operator}[${index}] is an object of operators: ${operator} takes values`);
      return NEVER;
    }
    return equalTo(value);
  });
}

/** The test of an object of operators on one field. */
function compileOperators(operators: Record<string, unknown>, at: string, problems: string[]): Test {
  const tests: Test[] = [];
  const entries = definedEntries(operators);
  const options = operators["$options"];
  if (options !== undefined && operators["$regex"] === undefined) problems.push(`${at}.$options needs $regex`);
  for (const [operator, operand] of entries) {
    switch (operator) {
      case "$eq":
        tests.push(equalTo(operand));
        break;
      case "$ne": {
        const test = equalTo(operand);
        tests.push((found) => !test(found));
        break;
      }
      case "$gt":
      case "$gte":
      case "$lt":
      case "$lte":
        tests.push(compareTo(operator, operand, at, problems));
        break;
      case "$in":
      case "$nin": {
        const list = listOf(operator, operand, at, problems);
        if (!list) break;
        tests.push(operator === "$in" ? (found) => list.some((test) => test(found)) : (found) => !list.some((test) => test(found)));
        break;
      }
      case "$all": {
        const list = listOf(operator, operand, at, problems);
        if (!list) break;
        // An empty $all matches nothing, as in MongoDB
        tests.push((found) => list.length > 0 && list.every((test) => test(found)));
        break;
      }
      case "$exists":
        if (typeof operand !== "boolean") {
          problems.push(`${at}.$exists takes true or false`);
          break;
        }
        tests.push((found) => (found.values.length > 0) === operand);
        break;
      case "$size":
        if (typeof operand !== "number" || !Number.isInteger(operand) || operand < 0) {
          problems.push(`${at}.$size takes a whole number, 0 or more`);
          break;
        }
        tests.push((found) => found.values.some((value) => Array.isArray(value) && value.length === operand));
        break;
      case "$regex": {
        const regex = regexOf(operand, options, at, problems);
        if (regex) tests.push((found) => candidates(found).some((value) => typeof value === "string" && regex.test(value)));
        break;
      }
      case "$options":
        break;
      case "$not": {
        if (!isOperatorObject(operand)) {
          problems.push(`${at}.$not takes an object of operators`);
          break;
        }
        const test = compileOperators(operand, `${at}.$not`, problems);
        tests.push((found) => !test(found));
        break;
      }
      case "$elemMatch":
        tests.push(elementMatch(operand, at, problems));
        break;
      default:
        problems.push(`${at}: the operator ${operator} is not known`);
    }
  }
  return tests.length === 1 ? tests[0]! : (found) => tests.every((test) => test(found));
}

/** The regular expression of `$regex` and `$options`, or undefined after a problem. */
function regexOf(pattern: unknown, flags: unknown, at: string, problems: string[]): RegExp | undefined {
  if (typeof pattern !== "string") {
    problems.push(`${at}.$regex takes a string`);
    return undefined;
  }
  if (flags !== undefined && (typeof flags !== "string" || !REGEX_FLAGS.test(flags))) {
    problems.push(`${at}.$options takes the flags i, m, s and u, each one time`);
    return undefined;
  }
  try {
    return new RegExp(pattern, typeof flags === "string" ? flags : "");
  } catch (error) {
    problems.push(`${at}.$regex is not a regular expression: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/** The test of `$elemMatch`: an element of an array matches the operators, or the selector of objects. */
function elementMatch(operand: unknown, at: string, problems: string[]): Test {
  if (!isObject(operand)) {
    problems.push(`${at}.$elemMatch takes an object`);
    return NEVER;
  }
  const keys = definedKeys(operand);
  if (isOperatorObject(operand) && !keys.some((key) => LOGICAL.has(key))) {
    const test = compileOperators(operand, `${at}.$elemMatch`, problems);
    return (found) =>
      found.values.some((value) => Array.isArray(value) && value.some((element) => element !== undefined && test({ values: [element], missing: false })));
  }
  const matcher = compileInto(operand, `${at}.$elemMatch`, problems);
  return (found) => found.values.some((value) => Array.isArray(value) && value.some((element) => isObject(element) && matcher(element)));
}

/** The test of the condition of one field path: an object of operators, or a literal. */
function compileCondition(condition: unknown, at: string, problems: string[]): Test {
  if (isObject(condition)) {
    const keys = definedKeys(condition);
    const operators = keys.filter((key) => key.startsWith("$"));
    if (operators.length > 0 && operators.length < keys.length) {
      problems.push(`${at} mixes operators and fields: write the fields as a literal, or use only operators`);
      return NEVER;
    }
    if (operators.length > 0) return compileOperators(condition, at, problems);
  }
  return equalTo(condition);
}

/** The matcher of a selector. Each problem goes to `problems`. */
function compileInto(selector: unknown, at: string, problems: string[]): Matcher {
  if (!isObject(selector)) {
    problems.push(`${at} must be an object`);
    return () => false;
  }
  const parts: Matcher[] = [];
  for (const [key, condition] of definedEntries(selector)) {
    if (key.startsWith("$")) {
      if (!LOGICAL.has(key)) {
        problems.push(`${at}: the operator ${key} is not known`);
        continue;
      }
      if (!Array.isArray(condition) || condition.length === 0) {
        problems.push(`${at}.${key} takes a list of one or more selectors`);
        continue;
      }
      const matchers = condition.map((part, index) => compileInto(part, `${at}.${key}[${index}]`, problems));
      if (key === "$and") parts.push((item) => matchers.every((matcher) => matcher(item)));
      else if (key === "$or") parts.push((item) => matchers.some((matcher) => matcher(item)));
      else parts.push((item) => !matchers.some((matcher) => matcher(item)));
      continue;
    }
    const path = pathOf(key, at, problems);
    if (!path) continue;
    const test = compileCondition(condition, `${at}.${key}`, problems);
    parts.push((item) => test(lookup(item, path)));
  }
  if (parts.length === 0) return ALWAYS;
  if (parts.length === 1) return parts[0]!;
  return (item) => parts.every((part) => part(item));
}

/**
 * This function gives the problems of a selector: each part that a query cannot use. An empty list
 * means that the selector is correct.
 */
export function selectorProblems(selector: unknown): string[] {
  const problems: string[] = [];
  compileInto(selector, "selector", problems);
  return problems;
}

/**
 * This function makes a test from a selector. The test gives true for each item that the selector
 * matches. Compile a selector one time for many items.
 *
 * @throws TypeError when the selector has a problem (refer to `selectorProblems`)
 */
export function compileSelector(selector: StorageSelector): (item: unknown) => boolean {
  const problems: string[] = [];
  const matcher = compileInto(selector, "selector", problems);
  if (problems.length > 0) throw new TypeError(`The selector is not correct: ${problems.join(". ")}`);
  return matcher;
}

/**
 * This function tells if a selector matches an item.
 *
 * @throws TypeError when the selector has a problem
 */
export function matchesSelector(selector: StorageSelector, item: unknown): boolean {
  return compileSelector(selector)(item);
}

//
// ═══ The options ═══
//

const OPTION_KEYS = new Set(["sort", "skip", "limit"]);

/** This function gives the problems of the options of a query. An empty list means that the options are correct. */
export function queryOptionsProblems(options: unknown): string[] {
  if (options === undefined) return [];
  if (!isObject(options)) return ["the options of a query must be an object"];
  const problems: string[] = [];
  for (const key of definedKeys(options)) {
    if (!OPTION_KEYS.has(key)) problems.push(`the option ${key} is not known: use sort, skip and limit`);
  }
  const sort = options["sort"];
  const skip = options["skip"];
  const limit = options["limit"];
  if (sort !== undefined) {
    if (!isObject(sort)) {
      problems.push("sort must be an object of field paths with 1 or -1");
    } else {
      for (const [key, direction] of definedEntries(sort)) {
        pathOf(key, "sort", problems);
        if (direction !== 1 && direction !== -1) problems.push(`sort.${key} must be 1 or -1`);
      }
    }
  }
  if (skip !== undefined && (typeof skip !== "number" || !Number.isSafeInteger(skip) || skip < 0)) {
    problems.push("skip must be a whole number, 0 or more");
  }
  if (limit !== undefined && (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1)) {
    problems.push("limit must be a whole number, 1 or more");
  }
  return problems;
}

/** The key of an item for one sort key: the least value for ascending, the most for descending. */
function sortKeyOf(item: unknown, path: readonly string[], direction: StorageSortDirection): unknown {
  const found = lookup(item, path);
  const values: unknown[] = [];
  for (const value of found.values) {
    if (Array.isArray(value)) values.push(...value);
    else values.push(value);
  }
  if (found.missing) values.push(null);
  if (values.length === 0) return null;
  let best = values[0];
  for (let index = 1; index < values.length; index++) {
    const result = compareStorageValues(values[index], best);
    if (direction === 1 ? result < 0 : result > 0) best = values[index];
  }
  return best;
}

/**
 * This function runs a query on entries, as the reference of each storage: the selector, then the
 * order, then the skip and the limit. The result has the entries themselves, not copies.
 *
 * - Without `sort`, the result has the order of the entries.
 * - A sort key on an array field uses its least element for ascending, and its most element for
 *   descending. A missing field sorts as `null`.
 *
 * @throws TypeError when the selector or the options have a problem
 */
export function queryEntries<T>(
  entries: Iterable<readonly [string, T]>,
  selector: StorageSelector = {},
  options: StorageQueryOptions = {},
): Array<[string, T]> {
  const matches = compileSelector(selector);
  const problems = queryOptionsProblems(options);
  if (problems.length > 0) throw new TypeError(`The options of the query are not correct: ${problems.join(". ")}`);
  let result: Array<[string, T]> = [];
  for (const [id, value] of entries) {
    if (matches(value)) result.push([id, value]);
  }
  const keys = definedEntries(options.sort ?? {}).map(([key, direction]) => ({
    path: key.split("."),
    direction: direction as StorageSortDirection,
  }));
  if (keys.length > 0) {
    const rows = result.map((entry, index) => ({ entry, index, keys: keys.map((key) => sortKeyOf(entry[1], key.path, key.direction)) }));
    rows.sort((a, b) => {
      for (let index = 0; index < keys.length; index++) {
        const delta = compareStorageValues(a.keys[index], b.keys[index]) * keys[index]!.direction;
        if (delta !== 0) return delta;
      }
      return a.index - b.index;
    });
    result = rows.map((row) => row.entry);
  }
  const skip = options.skip ?? 0;
  if (skip === 0 && options.limit === undefined) return result;
  return result.slice(skip, options.limit === undefined ? undefined : skip + options.limit);
}

//
// ═══ The patch ═══
//

/**
 * This function gives the problems of the fields of a patch. An empty list means that the fields
 * are correct: an object that is not an array.
 */
export function patchProblems(fields: unknown): string[] {
  return isObject(fields) ? [] : ["the fields of a patch must be an object"];
}

/** This function sets a key as an own property, also the key `__proto__`. */
function put(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * This function applies a JSON Merge Patch (RFC 7386) to a value, and gives the new value. It does
 * not change the value or the patch, but the new value can share parts with them.
 *
 * - Each field of the patch replaces the field of the value.
 * - An object field of the patch merges into an object field of the value.
 * - A `null` field removes the field.
 * - A value that is not an object becomes an empty object first.
 */
export function mergePatch(value: unknown, fields: StoragePatch): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (isObject(value)) {
    for (const key of Object.keys(value)) put(result, key, value[key]);
  }
  for (const key of Object.keys(fields)) {
    const field = fields[key];
    if (field === undefined) continue;
    if (field === null) delete result[key];
    else put(result, key, isObject(field) ? mergePatch(Object.hasOwn(result, key) ? result[key] : undefined, field) : field);
  }
  return result;
}
