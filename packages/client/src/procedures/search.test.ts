import { describe, expect, it } from "vitest";
import * as z from "zod";
import { defineProcedure } from "./define.js";
import { searchProceduresProcedure, type ProcedureSearchInput, type ProcedureSearchOutput } from "./define-procedure.js";
import { ProcedureRegistry } from "./registry.js";
import { SEARCH_LIMIT, searchDocuments, searchWords, type SearchDocument } from "./search.js";
import type { ProcedureContext, ProcedurePath } from "./types.js";

describe("searchWords", () => {
  it("splits at each character that is not a letter or a digit, and at each change of case", () => {
    expect(searchWords("bootstrapMedianRatio")).toEqual(["bootstrap", "median", "ratio"]);
    expect(searchWords("HTTPServer")).toEqual(["http", "server"]);
    expect(searchWords("git.status")).toEqual(["git", "statu"]);
    expect(searchWords("list-tools utf8")).toEqual(["list", "tool", "utf", "8"]);
    expect(searchWords("Größe")).toEqual(["größe"]);
  });

  it("removes the stop words and the plural s, and keeps a double s", () => {
    expect(searchWords("the median of the values")).toEqual(["median", "value"]);
    expect(searchWords("class process bus")).toEqual(["class", "process", "bus"]);
  });

  it("gives no words for a text of stop words or signs", () => {
    expect(searchWords("the and of")).toEqual([]);
    expect(searchWords(" -- ")).toEqual([]);
  });
});

const doc = (name: string, description?: string, tags?: string[]): SearchDocument => ({
  name,
  words: name.split("."),
  ...(description !== undefined ? { description } : {}),
  ...(tags ? { tags } : {}),
});

const CATALOG: SearchDocument[] = [
  doc("statistics.median", "The median of the values"),
  doc("statistics.mean", "The mean of the values, which is not the median"),
  doc("statistics.bootstrap", "A bootstrap interval of a statistic"),
  doc("statistics.wilson", "The Wilson interval of a proportion"),
  doc("git.status", "The status of the working tree", ["git"]),
  doc("git.log", "The commits of a branch", ["git"]),
  doc("fs.read", "Read a file", ["files"]),
  doc("fs.write", "Write a file", ["files"]),
];

const names = (query: string, limit?: number): string[] => searchDocuments(CATALOG, query, { limit }).hits.map((hit) => hit.name);

describe("searchDocuments", () => {
  it("ranks a match of the name above a match of the description", () => {
    expect(names("median")).toEqual(["statistics.median", "statistics.mean"]);
  });

  it("ranks a rare word above a common word", () => {
    // "interval" is in two documents and "wilson" in one
    expect(names("wilson interval")[0]).toBe("statistics.wilson");
    expect(names("git status")[0]).toBe("git.status");
  });

  it("matches the start of a longer word at half weight, from 3 characters", () => {
    expect(names("boot")).toEqual(["statistics.bootstrap"]);
    expect(names("bo")).toEqual([]);
    // The whole word counts more than the start of a word
    const exact = searchDocuments([doc("a.read"), doc("b.reader")], "read").hits;
    expect(exact.map((hit) => hit.name)).toEqual(["a.read", "b.reader"]);
    expect(exact[0]!.score).toBeGreaterThan(exact[1]!.score);
  });

  it("reads the tags", () => {
    expect(names("files")).toEqual(["fs.read", "fs.write"]);
  });

  it("gives the hits of one score in the order of their names", () => {
    expect(names("file")).toEqual(["fs.read", "fs.write"]);
  });

  it("gives no hit for a query with no search words, or for no documents", () => {
    expect(searchDocuments(CATALOG, "the of")).toEqual({ hits: [], matched: 0, total: CATALOG.length });
    expect(searchDocuments([], "median")).toEqual({ hits: [], matched: 0, total: 0 });
    expect(searchDocuments(CATALOG, "zebra")).toEqual({ hits: [], matched: 0, total: CATALOG.length });
  });

  it("gives at most the limit, and counts each match", () => {
    const many = Array.from({ length: 150 }, (_, i) => doc(`tool.t${String(i).padStart(3, "0")}`, "A tool"));
    expect(searchDocuments(many, "tool").hits).toHaveLength(SEARCH_LIMIT);
    expect(searchDocuments(many, "tool").matched).toBe(150);
    expect(searchDocuments(many, "tool", { limit: 3 }).hits).toHaveLength(3);
    expect(searchDocuments(many, "tool", { limit: 0 }).hits).toHaveLength(1);
    expect(searchDocuments(many, "tool", { limit: 1000 }).hits).toHaveLength(100);
    expect(searchDocuments(many, "tool", { limit: Number.NaN }).hits).toHaveLength(SEARCH_LIMIT);
  });

  it("gives the first line of the description, at most 200 characters, and a rounded score", () => {
    const long = "word ".repeat(60).trim();
    const [first, second, third] = searchDocuments([doc("a.word", `${long}\nmore`), doc("b.word", "One line\nTwo"), doc("c.word")], "word").hits;
    expect(first!.description).toHaveLength(200);
    expect(first!.description!.endsWith("…")).toBe(true);
    expect([second, third].map((hit) => hit!.description)).toContain("One line");
    expect([second, third].map((hit) => hit!.description)).toContain(undefined);
    for (const hit of [first, second, third]) expect(Math.round(hit!.score * 1000) / 1000).toBe(hit!.score);
  });

  it("uses the name as its words when a document has no words", () => {
    expect(searchDocuments([{ name: "wilsonInterval" }], "wilson").hits.map((hit) => hit.name)).toEqual(["wilsonInterval"]);
  });
});

describe("procedure.search", () => {
  const registry = new ProcedureRegistry();
  const add = (path: ProcedurePath, description: string): void => {
    registry.register(
      defineProcedure({ path, input: z.object({}), output: z.unknown(), metadata: { description }, handler: async () => null }),
    );
  };
  add(["statistics", "median"], "The median of the values");
  add(["statistics", "wilson"], "The Wilson interval of a proportion");
  add(["admin", "median"], "The median of the admin values");
  // A procedure with no handler cannot run, so the search does not give it
  registry.register({ path: ["statistics", "plan"], metadata: { description: "The plan of a median" } } as never);

  const search = (input: ProcedureSearchInput, expose?: (path: ProcedurePath) => boolean): Promise<ProcedureSearchOutput> =>
    searchProceduresProcedure.handler!(input, { registry, ...(expose ? { expose } : {}) } as unknown as ProcedureContext) as Promise<ProcedureSearchOutput>;

  it("gives the path, the key, the description and the score of each hit", async () => {
    const result = await search({ query: "median" });
    // The shorter document comes first
    expect(result.hits.map((hit) => hit.key)).toEqual(["statistics.median", "admin.median"]);
    expect(result.hits[0]).toMatchObject({ path: ["statistics", "median"], description: "The median of the values" });
    expect(result.hits[0]!.score).toBeGreaterThan(0);
    expect(result.matched).toBe(2);
    expect(result.total).toBe(3);
  });

  it("searches only the procedures that the host exposes", async () => {
    const result = await search({ query: "median" }, (path) => path[0] !== "admin");
    expect(result.hits.map((hit) => hit.key)).toEqual(["statistics.median"]);
    expect(result.total).toBe(2);
  });

  it("searches only one namespace, and gives at most the limit", async () => {
    expect((await search({ query: "median", namespace: "admin" })).hits.map((hit) => hit.key)).toEqual(["admin.median"]);
    expect((await search({ query: "median", limit: 1 })).hits).toHaveLength(1);
  });

  it("checks its input", () => {
    expect(searchProceduresProcedure.input!.safeParse({ query: "" }).success).toBe(false);
    expect(searchProceduresProcedure.input!.safeParse({ query: "x", limit: 101 }).success).toBe(false);
    expect(searchProceduresProcedure.input!.safeParse({ query: "x", limit: 5, namespace: "git" }).success).toBe(true);
  });
});
