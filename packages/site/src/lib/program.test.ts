import { describe, it, expect } from "vitest";
import { examples } from "./examples";
import {
  LIMITS,
  LocationError,
  canSetAt,
  checkProgram,
  countCalls,
  decodeProgram,
  encodeProgram,
  formatJson,
  getAt,
  newCall,
  parseProgram,
  readProgram,
  renameKey,
  renameProblem,
  setAt,
  toTypeScript,
  type Json,
} from "./program";

describe("the program model", () => {
  it("makes a call with defaults for the required fields", () => {
    expect(
      newCall(["client", "range"], [
        { name: "start", type: "number", optional: false },
        { name: "end", type: "number", optional: false },
        { name: "step", type: "number", optional: true },
      ]),
    ).toEqual({ $proc: ["client", "range"], input: { start: 0, end: 0 } });
  });

  it("counts the calls without recursion", () => {
    expect(countCalls(examples[0]!.program)).toBe(2);
    let deep: Json = { $proc: ["client", "identity"], input: { value: 1 } };
    for (let index = 0; index < 5000; index++) deep = [deep];
    expect(countCalls(deep)).toBe(1);
  });

  it("writes TypeScript with the proc() builder", () => {
    const code = toTypeScript(examples[0]!.program);
    expect(code).toContain('proc(["client","add"]).input({');
    expect(code).toContain('a: proc(["client","multiply"]).input({');
    expect(code).toContain(".ref,");
    expect(code).toContain("}).build());");
  });
});

describe("share links", () => {
  it("round-trip each example", () => {
    for (const example of examples) {
      expect(decodeProgram(encodeProgram(example.program))).toEqual(example.program);
    }
  });

  it("keep text that is not ASCII", () => {
    const program: Json = { $proc: ["client", "toUpper"], input: { value: "größe € 漢字" } };
    expect(decodeProgram(encodeProgram(program))).toEqual(program);
  });

  it("give a reason for a corrupt link (deep dive SITE-5)", () => {
    expect(decodeProgram("not base64 json")).toBeUndefined();
    const read = readProgram("not base64 json");
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toMatch(/not/);
  });

  it("refuse a program that is too deep or too large (deep dive SITE-6)", () => {
    // The text of 3000 nested lists: JSON.stringify of such a value overflows the stack in Node 22
    const deepText = "[".repeat(3000) + "1" + "]".repeat(3000);
    const link = btoa(deepText).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const read = readProgram(link);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("levels");
    // A bracket in a string does not count
    expect(readProgram(encodeProgram({ $proc: ["client", "identity"], input: { value: "[".repeat(500) } })).ok).toBe(true);
    let limit: Json = 1;
    for (let index = 0; index < LIMITS.depth; index++) limit = [limit];
    expect(readProgram(encodeProgram(limit)).ok).toBe(true);
    expect(readProgram(encodeProgram([limit])).ok).toBe(false);

    const wide: Json = Array.from({ length: LIMITS.nodes + 1 }, () => 0);
    expect(checkProgram(wide)).toContain("values");
    expect(checkProgram(JSON.parse('{"__proto__": {"x": 1}}'))).toContain("__proto__");
    expect(checkProgram(examples[1]!.program)).toBeNull();
  });
});

describe("edits", () => {
  const program: Json = { $proc: ["client", "add"], input: { a: 1, b: 2 } };

  it("set and remove values at a location", () => {
    expect(setAt(program, ["input", "a"], 5)).toEqual({ $proc: ["client", "add"], input: { a: 5, b: 2 } });
    expect(setAt(program, ["input", "b"], undefined)).toEqual({ $proc: ["client", "add"], input: { a: 1 } });
    expect(setAt([1, 2, 3], [1], undefined)).toEqual([1, 3]);
    expect(setAt([1, 2], [2], 3)).toEqual([1, 2, 3]);
  });

  it("make a missing input object", () => {
    expect(setAt({ $proc: ["client", "now"] }, ["input", "x"], 1)).toEqual({ $proc: ["client", "now"], input: { x: 1 } });
  });

  it("refuse an old location that does not fit the program (deep dive SITE-3)", () => {
    // Before, a stale selection replaced a list root or a primitive with an object
    expect(canSetAt([1, 2], ["input", "a"])).toBe(false);
    expect(() => setAt([1, 2], ["input", "a"], 5)).toThrow(LocationError);
    expect(canSetAt(7, ["input"])).toBe(false);
    expect(canSetAt([1, 2], [5])).toBe(false);
    expect(canSetAt([1, 2], [3, "x"])).toBe(false);
    expect(canSetAt(program, ["input", "a", "x"])).toBe(false);
    expect(canSetAt(program, ["__proto__"])).toBe(false);
    expect(canSetAt(null, [])).toBe(true);
  });

  it("read only own keys", () => {
    expect(getAt({}, ["constructor"])).toBeUndefined();
    expect(getAt({ constructor: 1 }, ["constructor"])).toBe(1);
  });

  it("rename keys with own-key checks (deep dive SITE-8)", () => {
    const object = { a: 1, b: 2 };
    expect(renameProblem(object, "a", "b")).toContain("already");
    expect(renameProblem(object, "a", "")).toContain("empty");
    // Before, `"constructor" in value` rejected an inherited name with no message
    expect(renameProblem(object, "a", "constructor")).toBeNull();
    expect(renameKey(object, "a", "constructor")).toEqual({ constructor: 1, b: 2 });
    expect(Object.keys(renameKey(object, "a", "c"))).toEqual(["c", "b"]);
  });
});

describe("formatJson", () => {
  it("keeps short values on one line and gives valid JSON", () => {
    for (const example of examples) {
      expect(JSON.parse(formatJson(example.program))).toEqual(example.program);
    }
    expect(formatJson({ $proc: ["client", "add"], input: { a: 1, b: "x,y" } })).toBe(
      '{ "$proc": ["client", "add"], "input": { "a": 1, "b": "x,y" } }',
    );
  });
});

describe("the format of the editor keeps each object key (O53)", () => {
  /** Each class of key that needs care in a printer or a parser, with examples. */
  const keyClasses: Array<[string, string[]]> = [
    ["double quotes", ['"', '""', 'a"', '"a"']],
    ["backslashes", ["\\", "\\\\", 'a\\', '\\"', "\\n", "\\u0041", "C:\\Users"]],
    ["line breaks and tabs", ["\n", "\r", "\r\n", "\t", "\n\t"]],
    ["control characters", ["\u0000", "\u0001", "\u001f", "\u007f", "\b", "\f"]],
    ["other Unicode", ["\u2028", "\u2029", "\ud800", "\udfff", "é", "😀"]],
    ["the empty key and spaces", ["", " ", "  ", " a "]],
    ["keys that look like numbers", ["0", "1", "01", "-1", "1.5", "1e3", "4294967295", "NaN", "Infinity"]],
    ["keys that look like keywords", ["true", "false", "null", "undefined", "constructor", "toString", "hasOwnProperty", "valueOf"]],
    ["the keys of calls and refs", ["$proc", "input", "$ref", "$name", "$when"]],
    ["the delimiters of the format", ["{", "}", "[", "]", ":", ",", ": ", ", ", '": "', '", "', '{ "a": 1 }', '"a": 1, "b"', "/", "/*", "//"]],
  ];

  const roundTrip = (program: Json): void => {
    expect(parseProgram(formatJson(program))).toEqual({ ok: true, program });
    expect(decodeProgram(encodeProgram(program))).toEqual(program);
  };

  it.each(keyClasses)("keeps keys with %s", (_name, keys) => {
    for (const key of keys) {
      roundTrip({ [key]: 1 });
      roundTrip({ $proc: ["a"], input: { "": [[{ [key]: key, x: null }]], [key]: { [key]: [key] } } });
      // A long object: formatJson puts each key on its own line
      roundTrip({ [key]: "a".repeat(70), z: { [key]: "b".repeat(70) } });
    }
  });

  it("keeps all the keys together in one object, in their order", () => {
    const keys = keyClasses.flatMap(([, list]) => list);
    const program = Object.fromEntries(keys.map((key, index) => [key, index])) as Json;
    const parsed = parseProgram(formatJson(program));
    expect(parsed).toEqual({ ok: true, program });
    expect(parsed.ok && Object.keys(parsed.program as object)).toEqual(Object.keys(program as object));
  });

  // V8 13.6 (Node 24) misreads the key of each case in JSON.parse after it reads the earlier key at
  // the same place. The fast-check seed -1991541530 found the first case. Each case starts
  // with a new key, so the objects of other tests do not change the hidden classes of V8. The test
  // makes no object with the keys before the parse: such an object also changes the hidden classes.
  // The earlier object has a third key: without it, V8 13.6 reads these three keys correctly.
  it.each([
    ['"', "\\", 1],
    ['a"', "a\\", 2],
    ['""', '\\"', 3],
    ["\n\t", "\\n", 4],
    ['C:"', "C:\\", 5],
  ])("keeps the key %j after JSON.parse reads the key %j", (key, earlier, id) => {
    const [editor, link] = [`"O53 editor ${id}"`, `"O53 link ${id}"`];
    const pair = `${JSON.stringify(key)}: null, " ": null`;
    for (const first of [editor, link]) JSON.parse(`{ ${first}: true, ${JSON.stringify(earlier)}: 1, "j": 2 }`);
    const fromEditor = parseProgram(`{ "$proc": ["a"], "input": { "x": [[{ ${editor}: null, ${pair} }]] } }`);
    const linkText = btoa(`[{ ${link}: null, ${pair} }]`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const fromLink = readProgram(linkText);
    expect(fromEditor.ok && fromEditor.program).toEqual({ $proc: ["a"], input: { x: [[{ [JSON.parse(editor)]: null, [key]: null, " ": null }]] } });
    expect(fromLink.ok && fromLink.program).toEqual([{ [JSON.parse(link)]: null, [key]: null, " ": null }]);
  });

  it("refuses the key __proto__, also when the text escapes it", () => {
    expect(parseProgram('{"__proto__": 1}').ok).toBe(false);
    expect(parseProgram('{"\\u005f_proto__": 1}').ok).toBe(false);
    expect(parseProgram('{"a": [{"__proto__": {"x": 1}}]}').ok).toBe(false);
  });
});
