// The tests of scripts/check-paths-and-writes.mjs (roadmap CLI-84), with source samples in memory.
// Start them with: node --test scripts/check-paths-and-writes.test.mjs

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findingsOf, isCheckedFile, problemsOf } from "./check-paths-and-writes.mjs";

const FILE = "packages/sample/src/sample.ts";

/** The rule and the line of each finding of a sample, in the order of the file. */
const found = (source, file = FILE) =>
  findingsOf(file, source)
    .filter((finding) => finding.allowed === undefined)
    .map(({ rule, line }) => `${rule}:${line}`);

/** The problems of one sample file, with empty lists of allowed files. */
const problems = (source, allowed = {}) => problemsOf([{ file: FILE, source }], { codec: new Set(), pathFiles: {}, writeFiles: {}, ...allowed }).problems;

describe("isCheckedFile", () => {
  it("examines the source files of packages/*/src", () => {
    for (const file of ["packages/client/src/client/client.ts", "packages/site/src/pages/Claude.tsx", "packages/x/src/a.mjs", "packages/x/src/a.js"]) {
      assert.equal(isCheckedFile(file), true, file);
    }
  });

  it("skips the tests, the test folders, the declarations and the files outside src", () => {
    for (const file of [
      "packages/client/src/procedures/segments.test.ts",
      "packages/site/e2e/seo.spec.ts",
      "packages/x/src/a.spec.tsx",
      "packages/x/src/__tests__/a.ts",
      "packages/x/src/test/helpers.ts",
      "packages/x/src/types.d.ts",
      "packages/client/test/wire/golden.ts",
      "packages/x/scripts/build.mjs",
      "scripts/check-scope.mjs",
      "packages/x/src/data.json",
    ]) {
      assert.equal(isCheckedFile(file), false, file);
    }
  });
});

describe('the rule "path"', () => {
  it("fails on a join or a split of a path, a key, a method or a topic on a dot", () => {
    const source = [
      `const key = path.join(".");`,
      `const segments = key.split(".");`,
      "const service = method.split(`.`);",
      String.raw`const parts = topic.split(/\./);`,
      `const name = procedure?.path?.join(".");`,
      `const short = path.slice(0, -1)["join"](".");`,
      `registry.get(key.split("."));`,
      "const k = `${path.join(\".\")}`;",
    ].join("\n");
    assert.deepEqual(found(source), ["path:1", "path:2", "path:3", "path:4", "path:5", "path:6", "path:7", "path:8"]);
  });

  it("fails on a topic made or read by hand: a template, a +, the prefix and a regular expression", () => {
    const source = [
      "const topic = `collections.${name}`;",
      "const partition = `collections.${name}.${partition}`;",
      `const other = "collections." + name;`,
      `const ok = topic.startsWith("collections.");`,
      String.raw`const match = /^collections\.([^.]+)\./.exec(topic);`,
      String.raw`const pattern = new RegExp("^collections\\.(.+)$");`,
      String.raw`const again = RegExp("collections\\.");`,
    ].join("\n");
    assert.deepEqual(found(source), ["path:1", "path:2", "path:3", "path:4", "path:5", "path:6", "path:7"]);
  });

  it("reports a call of a chain at the line of its method name", () => {
    const source = [`const short = key`, `  .split(".")`, `  .slice(0, -1)`, `  .join(".");`].join("\n");
    assert.deepEqual(found(source), ["path:2", "path:4"]);
  });

  it("passes the codec, other separators, display text in a sentence, comments and texts", () => {
    const source = [
      `import { pathToKey, keyToPath, collectionChangeTopic } from "@procedures/client";`,
      `const key = pathToKey(path);`,
      `const back = keyToPath(key);`,
      `const topic = collectionChangeTopic(name, partition);`,
      `const list = names.join(", ");`,
      `const parts = file.split("/");`,
      "throw new Error(`No procedure registered at path: ${path.join(\".\")}`);",
      "const message = `${(issue.path ?? []).join(\".\") || \"input\"}: ${issue.message}`;",
      `const text = "Procedure gave no output: " + path.join(".");`,
      "const label = `the topic collections.${name} has no subscriber`;",
      `// path.join(".") and key.split(".") in a comment`,
      `const sample = 'path.join(".") and /^collections\\./ in a text';`,
      `const topics = ["collections.*", "collections.notes"];`,
    ].join("\n");
    assert.deepEqual(found(source), []);
  });

  it("reads TypeScript and JSX", () => {
    const source = [
      `type Path = readonly string[];`,
      `export function label(path: Path): JSX.Element {`,
      `  return <span title={path.join(".")}>{path.join(" / ")}</span>;`,
      `}`,
    ].join("\n");
    assert.deepEqual(found(source, "packages/sample/src/label.tsx"), ["path:3"]);
  });

  it("allows a finding with a comment path-check and a reason, on its line or on the line above", () => {
    const source = [
      `// path-check: a field path of a document`,
      `const parts = field.split(".");`,
      `const ref = text.split(".")[0]; // path-check: the $ref of a program`,
      `/* path-check: an address */ const ip = bytes.join(".");`,
      `// path-check:`,
      `const key = path.join(".");`,
    ].join("\n");
    assert.deepEqual(found(source), ["path:6"]);
    assert.deepEqual(problems(source), [`${FILE}:6: path: join(".") of a path, a key, a method or a topic: use the codec of @procedures/client`]);
  });

  it("fails on a comment path-check without a finding", () => {
    const source = [`// path-check: a field path`, `const key = pathToKey(path);`].join("\n");
    assert.deepEqual(problems(source), [`${FILE}:1: the comment "path-check:" allows no finding on its line or on the next line: remove it`]);
  });

  it("skips the files of the codec and of PATH_FILES, and fails on a stale entry", () => {
    const source = `export const key = path.join(".");\n`;
    assert.deepEqual(problems(source, { codec: new Set([FILE]) }), []);
    assert.deepEqual(problems(source, { pathFiles: { [FILE]: "the dots of an address" } }), []);
    assert.deepEqual(problems(`export const key = pathToKey(path);\n`, { pathFiles: { [FILE]: "the dots of an address" } }), [
      `PATH_FILES: ${FILE} has no finding of the rule "path": remove the entry`,
    ]);
    assert.deepEqual(problems(`export const x = 1;\n`, { pathFiles: { "packages/gone/src/a.ts": "a file that does not exist" } }), [
      `PATH_FILES: packages/gone/src/a.ts is not a checked source file: remove the entry`,
    ]);
  });
});

describe('the rule "write"', () => {
  it("fails on each write method of the MongoDB driver", () => {
    const source = [
      `await db.collection("notes").insertOne(doc);`,
      `await items.updateMany({}, { $set: { a: 1 } });`,
      `await (await this.getCollection()).bulkWrite(operations);`,
      `await target?.deleteMany({});`,
      `await collection["replaceOne"]({ _id: id }, doc);`,
      `await counters.findOneAndUpdate({ _id: "seq" }, { $inc: { seq: 1 } });`,
      `await collection.insertMany(docs); await collection.deleteOne(filter); await collection.findOneAndDelete(filter); await collection.findOneAndReplace(filter, doc); await collection.updateOne(filter, update);`,
    ].join("\n");
    assert.deepEqual(found(source), ["write:1", "write:2", "write:3", "write:4", "write:5", "write:6", "write:7", "write:7", "write:7", "write:7", "write:7"]);
  });

  it("passes the reads, a text and a comment", () => {
    const source = [
      `const docs = await collection.find(filter).toArray();`,
      `const count = await collection.countDocuments({});`,
      `await storage.set("a", value);`,
      `// collection.insertOne(doc) in a comment`,
      `const sample = "collection.updateOne(filter)";`,
    ].join("\n");
    assert.deepEqual(found(source), []);
  });

  it("allows the files of WRITE_FILES, and fails on a stale entry", () => {
    const source = `await collection.updateOne(filter, update);\n`;
    assert.deepEqual(problems(source), [`${FILE}:1: write: updateOne() writes a collection outside the storage: use MongoDocumentStorage`]);
    assert.deepEqual(problems(source, { writeFiles: { [FILE]: "the storage" } }), []);
    assert.deepEqual(problems(`await collection.find({});\n`, { writeFiles: { [FILE]: "the storage" } }), [
      `WRITE_FILES: ${FILE} has no finding of the rule "write": remove the entry`,
    ]);
  });

  it("does not take a comment path-check for a write", () => {
    const source = [`// path-check: a raw write`, `await collection.insertOne(doc);`].join("\n");
    assert.deepEqual(problems(source), [
      `${FILE}:2: write: insertOne() writes a collection outside the storage: use MongoDocumentStorage`,
      `${FILE}:1: the comment "path-check:" allows no finding on its line or on the next line: remove it`,
    ]);
  });
});

describe("problemsOf", () => {
  it("fails on a file that the parser cannot read", () => {
    const [problem] = problemsOf([{ file: FILE, source: "const = ;" }]).problems;
    assert.match(problem, /^packages\/sample\/src\/sample\.ts: the parser cannot read the file: /);
  });
});
