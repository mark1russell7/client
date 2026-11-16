import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEPARATE_ARMS } from "./tenant-cases.js";
import { copiesOf, swap } from "./tenant-copies.js";

const source = readFileSync(new URL("../src/storage/document-storage.ts", import.meta.url), "utf8");

describe("the copies of the store of the suite tenant-separate", () => {
  it("finds each text that it changes in the source of this tree", () => {
    const copies = copiesOf(source);
    for (const arm of SEPARATE_ARMS) expect(copies[arm]).not.toBe(source);
    expect(copies.neither).not.toBe(copies.noqueue);
    expect(copies.neither).not.toBe(copies.many);
  });

  it("turns off the write queue and spreads the counter", () => {
    const copies = copiesOf(source);
    expect(copies.noqueue).toContain("  if (db) return task();\n");
    expect(copies.many).toContain("Math.floor(Math.random() * 1000)");
    expect(copies.neither).toContain("  if (db) return task();\n");
    expect(copies.neither).toContain("Math.floor(Math.random() * 1000)");
  });

  it("spreads the counter with either id: the collection name of main, or the counter id of a counter for each partition (CLI-96)", () => {
    const update = (id: string): string => `{ _id: ${id} },\n            { $inc: { seq: count }`;
    // The source of this tree has one of the two ids. The test makes the other one from it.
    const ids = ["this.collectionName", "this.counterId"];
    const own = ids.find((id) => source.includes(update(id)));
    expect(own).toBeDefined();
    for (const id of ids) {
      const text = source.replace(update(own!), update(id));
      expect(text).toContain(update(id));
      expect(copiesOf(text).many).toContain("{ _id: `${" + id + "}:${Math.floor(Math.random() * 1000)}` }");
    }
  });

  it("stops when the source does not have the text one time", () => {
    expect(() => swap("a", "b", "c")).toThrow(RangeError);
    expect(() => swap("bb", "b", "c")).toThrow(RangeError);
    expect(swap("abc", "b", "$&")).toBe("a$&c");
  });
});
