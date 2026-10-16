/**
 * JSON Patch (RFC 6902): apply a list of operations to a JSON value.
 *
 * The operations are `add`, `remove`, `replace`, `move`, `copy` and `test`. The patch applies to
 * a copy of the value, and all operations apply or none: the first failure throws, and the input
 * value does not change. A `path` or a `from` that names `__proto__`, `constructor` or
 * `prototype` is refused (roadmap R6).
 */

import { arrayIndex, lookup, parsePointer } from "./pointer.js";
import { cloneJson, formatPointer, isPlainObject, jsonEqual, JsonError, put, typeName, type JsonValue } from "./value.js";

/** One operation of a JSON Patch. */
export interface PatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  from?: string | undefined;
  value?: unknown;
}

/** The parent of a location: the container and the last token. */
function parentOf(document: JsonValue, tokens: readonly string[], fail: (message: string) => never): { container: JsonValue[] | Record<string, JsonValue>; token: string } {
  const parentTokens = tokens.slice(0, -1);
  const found = lookup(document, parentTokens);
  if (!found.found) fail(`the location ${formatPointer(parentTokens)} does not exist`);
  const container = (found as { value: JsonValue }).value;
  if (container === null || typeof container !== "object") fail(`the location ${formatPointer(parentTokens)} is ${typeName(container)}, not an object or an array`);
  return { container: container as JsonValue[] | Record<string, JsonValue>, token: tokens[tokens.length - 1]! };
}

function add(document: JsonValue, tokens: readonly string[], value: JsonValue, fail: (message: string) => never): JsonValue {
  if (tokens.length === 0) return value;
  const { container, token } = parentOf(document, tokens, fail);
  if (Array.isArray(container)) {
    if (token === "-") {
      container.push(value);
      return document;
    }
    const index = arrayIndex(token);
    if (index === undefined || index > container.length) fail(`the array index "${token}" is not 0 to ${container.length} or "-"`);
    container.splice(index!, 0, value);
    return document;
  }
  put(container, token, value);
  return document;
}

function remove(document: JsonValue, tokens: readonly string[], fail: (message: string) => never): { document: JsonValue; removed: JsonValue } {
  if (tokens.length === 0) fail("a patch cannot remove the whole value");
  const { container, token } = parentOf(document, tokens, fail);
  if (Array.isArray(container)) {
    const index = arrayIndex(token);
    if (index === undefined || index >= container.length) fail(`the array index "${token}" does not exist`);
    const [removed] = container.splice(index!, 1);
    return { document, removed: removed! };
  }
  if (!Object.prototype.hasOwnProperty.call(container, token)) fail(`the location ${formatPointer(tokens)} does not exist`);
  const removed = container[token]!;
  delete container[token];
  return { document, removed };
}

function replace(document: JsonValue, tokens: readonly string[], value: JsonValue, fail: (message: string) => never): JsonValue {
  if (tokens.length === 0) return value;
  if (!lookup(document, tokens).found) fail(`the location ${formatPointer(tokens)} does not exist`);
  const { container, token } = parentOf(document, tokens, fail);
  if (Array.isArray(container)) container[arrayIndex(token)!] = value;
  else put(container, token, value);
  return document;
}

/** The value of an operation: present, and JSON. */
function valueOf(operation: PatchOperation, fail: (message: string) => never): JsonValue {
  if (!("value" in operation) || operation.value === undefined) fail(`the operation ${operation.op} needs a value`);
  return cloneJson(operation.value as JsonValue);
}

/**
 * This function applies a JSON Patch to a copy of a value and gives the result. A bad operation,
 * a location that does not exist and a failed `test` throw a `JsonError` that names the index of
 * the operation.
 */
export function applyPatch(value: JsonValue, operations: readonly PatchOperation[]): JsonValue {
  let document = cloneJson(value);
  operations.forEach((operation, index) => {
    const fail = (message: string, code: "INVALID_PATCH" | "TEST_FAILED" = "INVALID_PATCH"): never => {
      throw new JsonError(code, `Operation ${index} (${operation.op} ${operation.path}): ${message}`);
    };
    if (!isPlainObject(operation) || typeof operation.path !== "string") fail("an operation is an object with op and path");
    const tokens = parsePointer(operation.path, `path of operation ${index}`);
    const fromTokens = (): string[] => {
      if (typeof operation.from !== "string") fail(`the operation ${operation.op} needs from`);
      return parsePointer(operation.from!, `from of operation ${index}`);
    };
    switch (operation.op) {
      case "add":
        document = add(document, tokens, valueOf(operation, fail), fail);
        break;
      case "remove":
        document = remove(document, tokens, fail).document;
        break;
      case "replace":
        document = replace(document, tokens, valueOf(operation, fail), fail);
        break;
      case "move": {
        const from = fromTokens();
        if (from.length === tokens.length && from.every((token, at) => token === tokens[at])) break;
        if (from.length < tokens.length && from.every((token, at) => token === tokens[at])) fail("a value cannot move into itself");
        const removed = remove(document, from, fail);
        document = add(removed.document, tokens, removed.removed, fail);
        break;
      }
      case "copy": {
        const from = fromTokens();
        const found = lookup(document, from);
        if (!found.found) fail(`the location ${formatPointer(from)} does not exist`);
        document = add(document, tokens, cloneJson((found as { value: JsonValue }).value), fail);
        break;
      }
      case "test": {
        const expected = valueOf(operation, fail);
        const found = lookup(document, tokens);
        if (!found.found) fail(`the location ${operation.path} does not exist`, "TEST_FAILED");
        if (!jsonEqual((found as { value: JsonValue }).value, expected)) fail(`the value is not ${JSON.stringify(expected)}`, "TEST_FAILED");
        break;
      }
      default:
        fail(`the operation ${JSON.stringify((operation as { op: unknown }).op)} is not add, remove, replace, move, copy or test`);
    }
  });
  return document;
}
