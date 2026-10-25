/**
 * A JSON parser that gives the same value as `JSON.parse`, for the program text of the Composer.
 *
 * `JSON.parse` of V8 13.6 (Node 24) reads some escaped object keys wrong (O53). V8 keeps a
 * transition from one hidden class to the next for each new key. When the last object that had the
 * same keys before had a next key K, V8 compares the raw characters of the source key with K. It
 * compares as many characters as the decoded key has, and it does not look at the escapes. Thus,
 * after `JSON.parse` reads `{"": 1, "\\": 2}` (the second key is one backslash), the text
 * `{"": 1, "\"": 2}` gives the key `\` and not `"`. A key `"\n\t"` after a key `\n` (backslash, n)
 * gives `\n`.
 *
 * The standalone repro is `scripts/v8-json-key-repro.mjs` (`node packages/site/scripts/v8-json-key-repro.mjs`).
 * It shows the bug on Node 24.21.0 (V8 13.6.233.17) and Node 25.2.1 (V8 14.1.146.11). The test of
 * the same sequence logs the result of `JSON.parse` for the Node versions of CI.
 *
 * This parser reads each key from its escapes, so no earlier object changes it. The parser has no
 * recursion: its stack is an array, so a deep text cannot overflow the call stack.
 */

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
const COLON = 0x3a;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const MINUS = 0x2d;

/** The JSON grammar of a number, at the position of `lastIndex`. */
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const HEX4 = /^[0-9a-fA-F]{4}$/;

/** The characters that an escape `\x` gives, for each `x` but `u`. */
const ESCAPES: ReadonlyMap<string, string> = new Map([
  ['"', '"'],
  ["\\", "\\"],
  ["/", "/"],
  ["b", "\b"],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
]);

type Frame = { kind: "array"; value: unknown[] } | { kind: "object"; value: Record<string, unknown>; key: string };

/**
 * This function puts a value at a key of an object, as `JSON.parse` does. The key `__proto__`
 * becomes an own property, so `checkProgram` sees it and refuses it.
 */
function putKey(object: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") Object.defineProperty(object, key, { value, writable: true, enumerable: true, configurable: true });
  else object[key] = value;
}

/**
 * This function gives the value of a JSON text. It throws a `SyntaxError` when the text is not
 * JSON. The value is equal to the value of `JSON.parse(text)` when V8 reads the keys correctly.
 */
export function parseJson(text: string): unknown {
  let index = 0;

  function fail(problem: string): never {
    throw new SyntaxError(index < text.length ? `${problem} at position ${index}` : `${problem} at the end of the JSON`);
  }

  function skipSpace(): void {
    for (;;) {
      const char = text.charCodeAt(index);
      if (char === 0x20 || char === 0x09 || char === 0x0a || char === 0x0d) index++;
      else return;
    }
  }

  function expectChar(char: number, problem: string): void {
    if (text.charCodeAt(index) !== char) fail(problem);
    index++;
  }

  /** This function reads a string. `index` is at its opening quote. */
  function readString(): string {
    index++;
    let value = "";
    let start = index;
    for (;;) {
      if (index >= text.length) fail("Unterminated string");
      const char = text.charCodeAt(index);
      if (char === QUOTE) {
        value += text.slice(start, index);
        index++;
        return value;
      }
      if (char < 0x20) fail("Bad control character in string");
      if (char !== BACKSLASH) {
        index++;
        continue;
      }
      value += text.slice(start, index);
      const escape = text.charAt(index + 1);
      if (escape === "u") {
        const hex = text.slice(index + 2, index + 6);
        if (!HEX4.test(hex)) fail("Bad Unicode escape");
        value += String.fromCharCode(Number.parseInt(hex, 16));
        index += 6;
      } else {
        const decoded = ESCAPES.get(escape);
        if (decoded === undefined) fail("Bad escaped character");
        value += decoded;
        index += 2;
      }
      start = index;
    }
  }

  /** This function reads a key and its colon. `index` is at the opening quote of the key. */
  function readKey(): string {
    if (text.charCodeAt(index) !== QUOTE) fail("Expected a double-quoted property name");
    const key = readString();
    skipSpace();
    expectChar(COLON, "Expected ':' after property name");
    return key;
  }

  const stack: Frame[] = [];
  for (;;) {
    skipSpace();
    let value: unknown;
    const char = text.charCodeAt(index);
    if (char === OPEN_BRACE) {
      index++;
      skipSpace();
      if (text.charCodeAt(index) !== CLOSE_BRACE) {
        stack.push({ kind: "object", value: {}, key: readKey() });
        continue;
      }
      index++;
      value = {};
    } else if (char === OPEN_BRACKET) {
      index++;
      skipSpace();
      if (text.charCodeAt(index) !== CLOSE_BRACKET) {
        stack.push({ kind: "array", value: [] });
        continue;
      }
      index++;
      value = [];
    } else if (char === QUOTE) {
      value = readString();
    } else if (char === MINUS || (char >= 0x30 && char <= 0x39)) {
      NUMBER.lastIndex = index;
      const match = NUMBER.exec(text);
      if (match === null) fail("No number after minus sign");
      value = Number(match[0]);
      index += match[0].length;
    } else if (text.startsWith("true", index)) {
      value = true;
      index += 4;
    } else if (text.startsWith("false", index)) {
      value = false;
      index += 5;
    } else if (text.startsWith("null", index)) {
      value = null;
      index += 4;
    } else {
      fail(index < text.length ? "Unexpected token" : "Unexpected end of JSON input");
    }

    // This loop puts the value in its array or object, and closes each array or object that ends
    for (;;) {
      const frame = stack[stack.length - 1];
      if (frame === undefined) {
        skipSpace();
        if (index < text.length) fail("Unexpected non-whitespace character after JSON");
        return value;
      }
      if (frame.kind === "array") frame.value.push(value);
      else putKey(frame.value, frame.key, value);
      skipSpace();
      if (text.charCodeAt(index) === COMMA) {
        index++;
        if (frame.kind === "object") {
          skipSpace();
          frame.key = readKey();
        }
        break;
      }
      if (frame.kind === "array") expectChar(CLOSE_BRACKET, "Expected ',' or ']' after array element");
      else expectChar(CLOSE_BRACE, "Expected ',' or '}' after property value");
      stack.pop();
      value = frame.value;
    }
  }
}
