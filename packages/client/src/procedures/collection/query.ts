/**
 * The query language of the collection storages: a selector, an order, a skip, a limit, the query
 * policy that limits them, and the two forms of a patch.
 *
 * A selector is JSON: a subset of the query selectors of MongoDB. It goes over the wire as it is,
 * so the procedure `collections.<name>.find` and `query()` of each storage take the same selector.
 * A storage that can run a selector itself (for example a database) gives the same result as
 * `queryEntries()` of this module, which is the reference.
 *
 * This module is the one copy of the language (roadmap CLI-34). The language is a part of the wire
 * contract of the core. `@procedures/collections` and the storage packages import it from
 * `@procedures/client/query`, an entry without other imports.
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
 * - A query policy limits the operators, the size and the depth of a selector, the lists, the
 *   regular expressions and the limit. The default policy does not permit `$regex`.
 */

// The precondition of the collection writes is a part of the wire contract too (roadmap CLI-16).
// This entry gives it to the storage packages: the module has no imports.
export {
  MAX_EXPECTED_VERSION_LENGTH,
  PRECONDITION_NOT_SUPPORTED,
  VERSION_CONFLICTS_METADATA_KEY,
  VersionConflictError,
  asVersionConflictError,
  isExpectedVersion,
  preconditionNotSupported,
  versionConflict,
  versionConflicts,
  versionConflictsOf,
} from "./precondition.js";
export type { CurrentItem, VersionConflict, VersionOf } from "./precondition.js";
// The guard of $regex has no imports either
import { exponentialRegex } from "./regex-guard.js";

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
  /** The value is a string that matches this regular expression. A query policy must permit it. */
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

/** An operator of the query language. `$options` goes with `$regex`. */
export type StorageQueryOperator = "$eq" | "$ne" | "$gt" | "$gte" | "$lt" | "$lte" | "$in" | "$nin" | "$exists" | "$not" | "$regex" | "$size" | "$all" | "$elemMatch" | "$and" | "$or" | "$nor";

/**
 * The limits of the queries of a caller. A host that serves selectors of callers that it does not
 * trust keeps them small. Each limit that a policy does not give has its default.
 */
export interface StorageQueryPolicy {
  /**
   * The operators that a selector can use.
   * @default DEFAULT_QUERY_OPERATORS: each operator except `$regex`
   */
  readonly operators?: readonly StorageQueryOperator[] | undefined;
  /**
   * The longest pattern of a `$regex`, in characters.
   * @default 128
   */
  readonly maxRegexLength?: number | undefined;
  /**
   * The flags that `$options` can have: some of `i`, `m`, `s` and `u`.
   * @default "imsu"
   */
  readonly regexFlags?: string | undefined;
  /**
   * The largest number of clauses of a selector: each condition of a field path, each operator and
   * each `$and`, `$or` and `$nor`.
   * @default 64
   */
  readonly maxClauses?: number | undefined;
  /**
   * The deepest nesting of a selector. Each `$and`, `$or`, `$nor`, `$not` and `$elemMatch` adds a
   * level.
   * @default 6
   */
  readonly maxDepth?: number | undefined;
  /**
   * The longest list of `$in`, `$nin` and `$all`.
   * @default 256
   */
  readonly maxListLength?: number | undefined;
  /**
   * The largest limit of a query. A query without a limit gets this limit.
   * @default no limit for a storage, and `DEFAULT_FIND_LIMIT` (1000) for the procedure `find`
   */
  readonly maxLimit?: number | undefined;
}

/** Each operator of the query language. A policy with these operators permits `$regex`. */
export const QUERY_OPERATORS: readonly StorageQueryOperator[] = Object.freeze([
  "$eq",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$in",
  "$nin",
  "$exists",
  "$not",
  "$regex",
  "$size",
  "$all",
  "$elemMatch",
  "$and",
  "$or",
  "$nor",
] as const);

/** The operators of the default policy: each operator except `$regex`. */
export const DEFAULT_QUERY_OPERATORS: readonly StorageQueryOperator[] = Object.freeze(QUERY_OPERATORS.filter((operator) => operator !== "$regex"));

/** The limits of a policy that gives no limit of its own. `$regex` is off. */
export const DEFAULT_QUERY_POLICY: StorageQueryPolicy = Object.freeze({
  operators: DEFAULT_QUERY_OPERATORS,
  maxRegexLength: 128,
  regexFlags: "imsu",
  maxClauses: 64,
  maxDepth: 6,
  maxListLength: 256,
});

/** The limit of the procedure `find` for a call without a limit, when its policy gives no `maxLimit`. */
export const DEFAULT_FIND_LIMIT: number = 1000;

/**
 * The fields of a patch. A patch has one of two forms:
 *
 * - A JSON Merge Patch (RFC 7386): each field replaces the field of the item, an object merges
 *   into an object field, and `null` removes the field.
 * - Operations (`StoragePatchOperations`): each key starts with `$`. `$set` can set `null` and
 *   nested field paths, and `$unset` removes field paths. `$remove` and `$insert` remove and add
 *   elements of arrays, as the operations `remove` and `add` of JSON Patch (RFC 6902).
 */
export type StoragePatch = Readonly<Record<string, unknown>>;

/**
 * The operations form of a patch: each key starts with `$`. It is a type of an object literal, so a
 * value of it is a `StoragePatch` too.
 */
export type StoragePatchOperations = {
  /** The values of field paths, for example `{ "meta.kind": "k1", note: null }`. */
  readonly $set?: Readonly<Record<string, unknown>> | undefined;
  /** The field paths to remove. An element of an array becomes `null`. */
  readonly $unset?: readonly string[] | undefined;
  /**
   * The field paths to remove. An element of an array leaves the array, and the next elements move
   * down by one. A field of an object goes, as with `$unset`. A missing path changes nothing.
   */
  readonly $remove?: readonly string[] | undefined;
  /**
   * The elements to add to arrays. Each path ends with an index, for example `{ "tags.1": "x" }`.
   * The element at that index and the next elements move up by one. The index that is equal to the
   * length of the array adds the element at the end.
   */
  readonly $insert?: Readonly<Record<string, unknown>> | undefined;
};

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

/** The defined entries of an object, as JSON keeps them. */
function definedEntries(value: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(value).filter(([, entry]) => entry !== undefined);
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
// ═══ The query policy ═══
//

/** A policy with each limit. */
interface Limits {
  readonly operators: ReadonlySet<string>;
  readonly maxRegexLength: number;
  readonly regexFlags: string;
  readonly maxClauses: number;
  readonly maxDepth: number;
  readonly maxListLength: number;
  readonly maxLimit: number;
}

/** The limits of a policy: each limit that the policy does not give has its default. */
function limitsOf(policy: StorageQueryPolicy | undefined): Limits {
  return {
    operators: new Set<string>(policy?.operators ?? DEFAULT_QUERY_OPERATORS),
    maxRegexLength: policy?.maxRegexLength ?? 128,
    regexFlags: policy?.regexFlags ?? "imsu",
    maxClauses: policy?.maxClauses ?? 64,
    maxDepth: policy?.maxDepth ?? 6,
    maxListLength: policy?.maxListLength ?? 256,
    maxLimit: policy?.maxLimit ?? Number.POSITIVE_INFINITY,
  };
}

/** The state of the compiler of one selector. */
interface Compilation {
  readonly limits: Limits;
  readonly problems: string[];
  clauses: number;
}

const KNOWN = new Set<string>(QUERY_OPERATORS);

/** False, with a problem, when the language does not know the operator, or the policy does not permit it. */
function permitted(operator: string, at: string, compilation: Compilation): boolean {
  if (!KNOWN.has(operator)) {
    compilation.problems.push(`${at}: the operator ${operator} is not known`);
    return false;
  }
  if (!compilation.limits.operators.has(operator)) {
    const hint = operator === "$regex" ? ". A host turns it on with a queryPolicy whose operators include $regex" : "";
    compilation.problems.push(`${at}: the query policy does not permit the operator ${operator}${hint}`);
    return false;
  }
  compilation.clauses++;
  return true;
}

/** False, with a problem, when the nesting goes deeper than the policy permits. */
function withinDepth(depth: number, at: string, compilation: Compilation): boolean {
  if (depth <= compilation.limits.maxDepth) return true;
  compilation.problems.push(`${at}: the selector is nested deeper than the ${compilation.limits.maxDepth} levels of the query policy`);
  return false;
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
function compareTo(operator: string, operand: unknown, at: string, compilation: Compilation): Test {
  if (operand === null) {
    // Only null is equal to null: $gte and $lte match null and a missing field
    return operator === "$gte" || operator === "$lte" ? equalTo(null) : NEVER;
  }
  if (typeof operand !== "number" && typeof operand !== "string" && typeof operand !== "boolean") {
    compilation.problems.push(`${at}.${operator} takes a number, a string, a boolean or null`);
    return NEVER;
  }
  const accept: (result: number) => boolean =
    operator === "$gt" ? (result) => result > 0 : operator === "$gte" ? (result) => result >= 0 : operator === "$lt" ? (result) => result < 0 : (result) => result <= 0;
  return (found) => candidates(found).some((value) => comparable(value, operand) && accept(compareStorageValues(value, operand)));
}

/** The tests of a list operator: `$in`, `$nin` or `$all`. */
function listOf(operator: string, operand: unknown, at: string, compilation: Compilation): Test[] | undefined {
  if (!Array.isArray(operand)) {
    compilation.problems.push(`${at}.${operator} takes a list`);
    return undefined;
  }
  if (operand.length > compilation.limits.maxListLength) {
    compilation.problems.push(`${at}.${operator} has ${operand.length} values, more than the ${compilation.limits.maxListLength} of the query policy`);
    return undefined;
  }
  return operand.map((value, index) => {
    if (isOperatorObject(value)) {
      compilation.problems.push(`${at}.${operator}[${index}] is an object of operators: ${operator} takes values`);
      return NEVER;
    }
    return equalTo(value);
  });
}

/** The test of an object of operators on one field. */
function compileOperators(operators: Record<string, unknown>, at: string, compilation: Compilation, depth: number): Test {
  const tests: Test[] = [];
  const options = operators["$options"];
  if (options !== undefined && operators["$regex"] === undefined) compilation.problems.push(`${at}.$options needs $regex`);
  for (const [operator, operand] of definedEntries(operators)) {
    // $options goes with $regex
    if (operator === "$options") continue;
    if (!permitted(operator, at, compilation)) continue;
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
        tests.push(compareTo(operator, operand, at, compilation));
        break;
      case "$in":
      case "$nin": {
        const list = listOf(operator, operand, at, compilation);
        if (!list) break;
        tests.push(operator === "$in" ? (found) => list.some((test) => test(found)) : (found) => !list.some((test) => test(found)));
        break;
      }
      case "$all": {
        const list = listOf(operator, operand, at, compilation);
        if (!list) break;
        // An empty $all matches nothing, as in MongoDB
        tests.push((found) => list.length > 0 && list.every((test) => test(found)));
        break;
      }
      case "$exists":
        if (typeof operand !== "boolean") {
          compilation.problems.push(`${at}.$exists takes true or false`);
          break;
        }
        tests.push((found) => (found.values.length > 0) === operand);
        break;
      case "$size":
        if (typeof operand !== "number" || !Number.isInteger(operand) || operand < 0) {
          compilation.problems.push(`${at}.$size takes a whole number, 0 or more`);
          break;
        }
        tests.push((found) => found.values.some((value) => Array.isArray(value) && value.length === operand));
        break;
      case "$regex": {
        const regex = regexOf(operand, options, at, compilation);
        if (regex) tests.push((found) => candidates(found).some((value) => typeof value === "string" && regex.test(value)));
        break;
      }
      case "$not": {
        if (!isOperatorObject(operand)) {
          compilation.problems.push(`${at}.$not takes an object of operators`);
          break;
        }
        if (!withinDepth(depth + 1, `${at}.$not`, compilation)) break;
        const test = compileOperators(operand, `${at}.$not`, compilation, depth + 1);
        tests.push((found) => !test(found));
        break;
      }
      case "$elemMatch":
        tests.push(elementMatch(operand, at, compilation, depth + 1));
        break;
      default:
        // $and, $or and $nor are operators of a selector, not of a field
        compilation.problems.push(`${at}: the operator ${operator} goes at the top of a selector, not on a field`);
    }
  }
  return tests.length === 1 ? tests[0]! : (found) => tests.every((test) => test(found));
}

/** The regular expression of `$regex` and `$options`, or undefined after a problem. */
function regexOf(pattern: unknown, flags: unknown, at: string, compilation: Compilation): RegExp | undefined {
  const { limits, problems } = compilation;
  if (typeof pattern !== "string") {
    problems.push(`${at}.$regex takes a string`);
    return undefined;
  }
  if (pattern.length > limits.maxRegexLength) {
    problems.push(`${at}.$regex has ${pattern.length} characters, more than the ${limits.maxRegexLength} of the query policy`);
    return undefined;
  }
  if (flags !== undefined && (typeof flags !== "string" || !REGEX_FLAGS.test(flags))) {
    problems.push(`${at}.$options takes the flags i, m, s and u, each one time`);
    return undefined;
  }
  const refused = typeof flags === "string" ? [...flags].filter((flag) => !limits.regexFlags.includes(flag)) : [];
  if (refused.length > 0) {
    problems.push(`${at}.$options has the flag ${refused.join(", ")}, and the query policy permits only "${limits.regexFlags}"`);
    return undefined;
  }
  // The guard reads the pattern with its flags. (Before, it found only a repeated group with an
  // unbounded repetition inside, not (a|aa)+ or (a{1,50}){1,50}: audit O56.)
  const risk = exponentialRegex(pattern, typeof flags === "string" ? flags : "");
  if (risk !== undefined) {
    problems.push(`${at}.$regex ${risk}: such a pattern can take an exponential time`);
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
function elementMatch(operand: unknown, at: string, compilation: Compilation, depth: number): Test {
  if (!isObject(operand)) {
    compilation.problems.push(`${at}.$elemMatch takes an object`);
    return NEVER;
  }
  if (!withinDepth(depth, `${at}.$elemMatch`, compilation)) return NEVER;
  const keys = definedKeys(operand);
  if (isOperatorObject(operand) && !keys.some((key) => LOGICAL.has(key))) {
    const test = compileOperators(operand, `${at}.$elemMatch`, compilation, depth);
    return (found) =>
      found.values.some((value) => Array.isArray(value) && value.some((element) => element !== undefined && test({ values: [element], missing: false })));
  }
  const matcher = compileInto(operand, `${at}.$elemMatch`, compilation, depth);
  return (found) => found.values.some((value) => Array.isArray(value) && value.some((element) => isObject(element) && matcher(element)));
}

/** The test of the condition of one field path: an object of operators, or a literal. */
function compileCondition(condition: unknown, at: string, compilation: Compilation, depth: number): Test {
  if (isObject(condition)) {
    const keys = definedKeys(condition);
    const operators = keys.filter((key) => key.startsWith("$"));
    if (operators.length > 0 && operators.length < keys.length) {
      compilation.problems.push(`${at} mixes operators and fields: write the fields as a literal, or use only operators`);
      return NEVER;
    }
    if (operators.length > 0) return compileOperators(condition, at, compilation, depth);
  }
  compilation.clauses++;
  return equalTo(condition);
}

/** The matcher of a selector. Each problem goes to the compilation. */
function compileInto(selector: unknown, at: string, compilation: Compilation, depth: number): Matcher {
  if (!isObject(selector)) {
    compilation.problems.push(`${at} must be an object`);
    return () => false;
  }
  const parts: Matcher[] = [];
  for (const [key, condition] of definedEntries(selector)) {
    if (key.startsWith("$")) {
      if (!LOGICAL.has(key)) {
        compilation.problems.push(`${at}: the operator ${key} is not known`);
        continue;
      }
      if (!permitted(key, at, compilation)) continue;
      if (!Array.isArray(condition) || condition.length === 0) {
        compilation.problems.push(`${at}.${key} takes a list of one or more selectors`);
        continue;
      }
      if (!withinDepth(depth + 1, `${at}.${key}`, compilation)) continue;
      const matchers = condition.map((part, index) => compileInto(part, `${at}.${key}[${index}]`, compilation, depth + 1));
      if (key === "$and") parts.push((item) => matchers.every((matcher) => matcher(item)));
      else if (key === "$or") parts.push((item) => matchers.some((matcher) => matcher(item)));
      else parts.push((item) => !matchers.some((matcher) => matcher(item)));
      continue;
    }
    const path = pathOf(key, at, compilation.problems);
    if (!path) continue;
    const test = compileCondition(condition, `${at}.${key}`, compilation, depth);
    parts.push((item) => test(lookup(item, path)));
  }
  if (parts.length === 0) return ALWAYS;
  if (parts.length === 1) return parts[0]!;
  return (item) => parts.every((part) => part(item));
}

/** This function compiles a selector, and gives the matcher and each problem. */
function compile(selector: unknown, policy: StorageQueryPolicy | undefined): { matcher: Matcher; problems: string[] } {
  const compilation: Compilation = { limits: limitsOf(policy), problems: [], clauses: 0 };
  const matcher = compileInto(selector, "selector", compilation, 0);
  if (compilation.clauses > compilation.limits.maxClauses) {
    compilation.problems.push(`selector: it has ${compilation.clauses} clauses, more than the ${compilation.limits.maxClauses} of the query policy`);
  }
  return { matcher, problems: compilation.problems };
}

/**
 * This function gives the problems of a selector: each part that the language does not know, and
 * each part that the policy does not permit. An empty list means that the selector is correct.
 *
 * @param policy - The query policy. The default policy does not permit `$regex`.
 */
export function selectorProblems(selector: unknown, policy?: StorageQueryPolicy): string[] {
  return compile(selector, policy).problems;
}

/**
 * This function makes a test from a selector. The test gives true for each item that the selector
 * matches. Compile a selector one time for many items.
 *
 * @param policy - The query policy. The default policy does not permit `$regex`.
 * @throws TypeError when the selector has a problem (refer to `selectorProblems`)
 */
export function compileSelector(selector: StorageSelector, policy?: StorageQueryPolicy): (item: unknown) => boolean {
  const { matcher, problems } = compile(selector, policy);
  if (problems.length > 0) throw new TypeError(`The selector is not correct: ${problems.join(". ")}`);
  return matcher;
}

/**
 * This function tells if a selector matches an item.
 *
 * @throws TypeError when the selector has a problem
 */
export function matchesSelector(selector: StorageSelector, item: unknown, policy?: StorageQueryPolicy): boolean {
  return compileSelector(selector, policy)(item);
}

//
// ═══ The options ═══
//

const OPTION_KEYS = new Set(["sort", "skip", "limit"]);

/**
 * This function gives the problems of the options of a query. An empty list means that the
 * options are correct. A policy with a `maxLimit` refuses a larger limit.
 */
export function queryOptionsProblems(options: unknown, policy?: StorageQueryPolicy): string[] {
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
  } else if (typeof limit === "number") {
    const maxLimit = limitsOf(policy).maxLimit;
    if (limit > maxLimit) problems.push(`limit must be at most ${maxLimit}, the maxLimit of the query policy`);
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
 * - A query without a limit gets the `maxLimit` of the policy, when it has one.
 *
 * @param policy - The query policy. The default policy does not permit `$regex`.
 * @throws TypeError when the selector or the options have a problem
 */
export function queryEntries<T>(
  entries: Iterable<readonly [string, T]>,
  selector: StorageSelector = {},
  options: StorageQueryOptions = {},
  policy?: StorageQueryPolicy,
): Array<[string, T]> {
  const matches = compileSelector(selector, policy);
  const problems = queryOptionsProblems(options, policy);
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
  const maxLimit = limitsOf(policy).maxLimit;
  const limit = options.limit ?? (Number.isFinite(maxLimit) ? maxLimit : undefined);
  if (skip === 0 && limit === undefined) return result;
  return result.slice(skip, limit === undefined ? undefined : skip + limit);
}

//
// ═══ The patch ═══
//

const PATCH_OPERATIONS = new Set(["$set", "$unset", "$remove", "$insert"]);

/** The path of the array of an element path: the path without its last part. */
function arrayPathOf(key: string): string {
  const dot = key.lastIndexOf(".");
  return dot === -1 ? "" : key.slice(0, dot);
}

/** True for the operations form of a patch: an object whose defined keys each start with `$`. */
export function isPatchOperations(fields: unknown): fields is StoragePatchOperations {
  return isOperatorObject(fields);
}

/**
 * This function gives the problems of the fields of a patch. An empty list means that the patch
 * is correct: a JSON Merge Patch, or the operations `$set`, `$unset`, `$remove` and `$insert`.
 *
 * - A patch that mixes the two forms is not correct.
 * - Two paths of a patch must not overlap: a path must not be the same as another path, or start
 *   with it.
 * - Each path of `$insert` ends with an index.
 * - A patch must not remove and insert elements of the same array.
 */
export function patchProblems(fields: unknown): string[] {
  if (!isObject(fields)) return ["the fields of a patch must be an object"];
  const keys = definedKeys(fields);
  const operations = keys.filter((key) => key.startsWith("$"));
  if (operations.length === 0) return [];
  if (operations.length < keys.length) {
    return ["the patch mixes operations and fields: give operations ($set, $unset, $remove, $insert), or only fields (a JSON Merge Patch)"];
  }
  const problems: string[] = [];
  const paths: string[] = [];
  for (const operation of operations) {
    if (!PATCH_OPERATIONS.has(operation)) problems.push(`the patch operation ${operation} is not known: use $set, $unset, $remove and $insert`);
  }
  const set = fields["$set"];
  if (set !== undefined) {
    if (!isObject(set)) problems.push("$set takes an object of field paths and values");
    else for (const key of definedKeys(set)) if (pathOf(key, "$set", problems)) paths.push(key);
  }
  const unset = fields["$unset"];
  if (unset !== undefined) {
    if (!Array.isArray(unset) || !unset.every((path) => typeof path === "string")) problems.push("$unset takes a list of field paths");
    else for (const key of unset as string[]) if (pathOf(key, "$unset", problems)) paths.push(key);
  }
  const remove = fields["$remove"];
  const removedArrays = new Set<string>();
  if (remove !== undefined) {
    if (!Array.isArray(remove) || !remove.every((path) => typeof path === "string")) problems.push("$remove takes a list of field paths");
    else {
      for (const key of remove as string[]) {
        if (!pathOf(key, "$remove", problems)) continue;
        paths.push(key);
        removedArrays.add(arrayPathOf(key));
      }
    }
  }
  const insert = fields["$insert"];
  if (insert !== undefined) {
    if (!isObject(insert)) problems.push("$insert takes an object of field paths and values");
    else {
      for (const key of definedKeys(insert)) {
        const segments = pathOf(key, "$insert", problems);
        if (!segments) continue;
        if (!INDEX.test(segments.at(-1)!)) {
          problems.push(`$insert: the field path "${key}" does not end with an index`);
          continue;
        }
        paths.push(key);
        if (removedArrays.has(arrayPathOf(key))) problems.push(`the patch removes and inserts elements of the same array ${arrayPathOf(key)}`);
      }
    }
  }
  for (let first = 0; first < paths.length; first++) {
    for (let second = first + 1; second < paths.length; second++) {
      const a = paths[first]!;
      const b = paths[second]!;
      if (a === b || b.startsWith(`${a}.`) || a.startsWith(`${b}.`)) problems.push(`the field paths ${a} and ${b} of the patch overlap`);
    }
  }
  return problems;
}

/** This function sets a key as an own property, also the key `__proto__`. */
function put(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/** A shallow copy of an object, with its own keys, also `__proto__`. */
function copyOf(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) put(result, key, value[key]);
  return result;
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
  const result = isObject(value) ? copyOf(value) : {};
  for (const key of Object.keys(fields)) {
    const field = fields[key];
    if (field === undefined) continue;
    if (field === null) delete result[key];
    else put(result, key, isObject(field) ? mergePatch(Object.hasOwn(result, key) ? result[key] : undefined, field) : field);
  }
  return result;
}

/** The container at a path with a new value at its end: a copy of each object and array on the path. */
function setIn(container: unknown, path: readonly string[], index: number, value: unknown): unknown {
  const key = path[index]!;
  const last = index === path.length - 1;
  const where = path.slice(0, index).join(".") || "the item";
  if (Array.isArray(container)) {
    if (!INDEX.test(key)) throw new TypeError(`The patch cannot set ${path.join(".")}: ${where} is an array`);
    const position = Number(key);
    if (position > container.length) {
      throw new TypeError(`The patch cannot set ${path.join(".")}: ${where} has ${container.length} elements`);
    }
    const copy = container.slice();
    copy[position] = last ? value : setIn(copy[position] ?? {}, path, index + 1, value);
    return copy;
  }
  if (!isObject(container)) throw new TypeError(`The patch cannot set ${path.join(".")}: ${where} is not an object`);
  const copy = copyOf(container);
  const child = Object.hasOwn(copy, key) ? copy[key] : undefined;
  put(copy, key, last ? value : setIn(child ?? {}, path, index + 1, value));
  return copy;
}

/**
 * The container without the value at a path: a copy of each object and array on the path. With
 * `splice`, an element of an array leaves the array (`$remove`). Without it, the element becomes
 * `null`, as in MongoDB (`$unset`).
 */
function unsetIn(container: unknown, path: readonly string[], index: number, splice = false): unknown {
  const key = path[index]!;
  const last = index === path.length - 1;
  if (Array.isArray(container)) {
    if (!INDEX.test(key) || Number(key) >= container.length) return container;
    const copy = container.slice();
    if (last && splice) copy.splice(Number(key), 1);
    else copy[Number(key)] = last ? null : unsetIn(copy[Number(key)], path, index + 1, splice);
    return copy;
  }
  if (!isObject(container) || !Object.hasOwn(container, key)) return container;
  const copy = copyOf(container);
  if (last) delete copy[key];
  else put(copy, key, unsetIn(copy[key], path, index + 1, splice));
  return copy;
}

/** The container with a new element in an array at a path: a copy of each object and array on the path. */
function insertIn(container: unknown, path: readonly string[], index: number, value: unknown): unknown {
  const key = path[index]!;
  const where = path.slice(0, index).join(".") || "the item";
  if (index === path.length - 1) {
    if (!Array.isArray(container)) throw new TypeError(`The patch cannot insert at ${path.join(".")}: ${where} is not an array`);
    const position = Number(key);
    if (position > container.length) {
      throw new TypeError(`The patch cannot insert at ${path.join(".")}: ${where} has ${container.length} elements`);
    }
    const copy = container.slice();
    copy.splice(position, 0, value);
    return copy;
  }
  if (Array.isArray(container)) {
    if (!INDEX.test(key) || Number(key) >= container.length) {
      throw new TypeError(`The patch cannot insert at ${path.join(".")}: ${where} has no element ${key}`);
    }
    const copy = container.slice();
    copy[Number(key)] = insertIn(copy[Number(key)], path, index + 1, value);
    return copy;
  }
  if (!isObject(container) || !Object.hasOwn(container, key)) {
    throw new TypeError(`The patch cannot insert at ${path.join(".")}: ${where} has no field ${key}`);
  }
  const copy = copyOf(container);
  put(copy, key, insertIn(copy[key], path, index + 1, value));
  return copy;
}

/** An operation that moves elements of an array: a `$remove` or an `$insert`. */
interface Move {
  readonly path: readonly string[];
  readonly insert: boolean;
  readonly value?: unknown;
}

/**
 * The order of the moves. Each index refers to the item before the patch. A move changes the
 * indices of the next elements of its array, and of the paths through them. Thus the deeper paths
 * go first, and in one array the higher indices go first.
 */
function compareMoves(a: Move, b: Move): number {
  if (a.path.length !== b.path.length) return b.path.length - a.path.length;
  return Number(b.path.at(-1)) - Number(a.path.at(-1)) || 0;
}

/**
 * This function applies a patch to a value, and gives the new value: a JSON Merge Patch, or the
 * operations `$set`, `$unset`, `$remove` and `$insert`. It does not change the value or the patch.
 *
 * - `$set` sets each field path, also to `null`. A missing or null part of a path becomes an object.
 * - `$unset` removes each field path. An element of an array becomes `null`.
 * - `$remove` removes each field path. An element of an array leaves the array, as the operation
 *   `remove` of JSON Patch (RFC 6902). A missing path changes nothing.
 * - `$insert` adds each element to an array, as the operation `add` of JSON Patch. The index that
 *   is equal to the length adds the element at the end.
 * - Each index refers to the value before the patch. `$set` and `$unset` go first. Then the
 *   function removes and adds the elements from the deepest path, and from the highest index.
 * - A value that is not an object becomes an empty object first.
 *
 * @throws TypeError when the patch has a problem (refer to `patchProblems`), when a path of
 *   `$set` goes through a value that is not an object, or past the end of an array, or when a path
 *   of `$insert` is not in an array, or goes past the end of the array
 */
export function applyPatch(value: unknown, fields: StoragePatch): Record<string, unknown> {
  const problems = patchProblems(fields);
  if (problems.length > 0) throw new TypeError(`The patch is not correct: ${problems.join(". ")}`);
  if (!isPatchOperations(fields)) return mergePatch(value, fields);
  let result: unknown = isObject(value) ? value : {};
  for (const [key, field] of definedEntries(fields.$set ?? {})) result = setIn(result, key.split("."), 0, field);
  for (const key of fields.$unset ?? []) result = unsetIn(result, key.split("."), 0);
  const moves: Move[] = [
    ...(fields.$remove ?? []).map((key): Move => ({ path: key.split("."), insert: false })),
    ...definedEntries(fields.$insert ?? {}).map(([key, field]): Move => ({ path: key.split("."), insert: true, value: field })),
  ].sort(compareMoves);
  for (const move of moves) result = move.insert ? insertIn(result, move.path, 0, move.value) : unsetIn(result, move.path, 0, true);
  return result === value ? copyOf(value as Record<string, unknown>) : (result as Record<string, unknown>);
}
