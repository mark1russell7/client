/**
 * The guard of an aggregation pipeline over shared collections (Graph's split plan, part P3). Each
 * case is a property of the isolation (reads of another partition, `$out`, the JavaScript of the
 * server) or of the copies (the guard changes no part of the pipeline of the caller).
 */

import { describe, expect, it } from "vitest";
import type { Document } from "mongodb";
import {
  assertNoBlockedOperators,
  boundPipeline,
  cutResults,
  DEFAULT_PIPELINE_LIMITS,
  isTimeLimitError,
  scopePipeline,
  type PipelineScope,
} from "./pipeline-scope.js";

const READ: PipelineScope = { match: { _part: "t1" } };
const WRITE: PipelineScope = { match: { _part: "t1" }, stamp: { _part: "t1" } };
const filter = { $match: { _part: "t1" } };

describe("scopePipeline: the filter of the scope", () => {
  it("goes first in a plain pipeline, one time", () => {
    expect(scopePipeline([{ $sort: { x: 1 } }, { $limit: 5 }], READ)).toEqual([filter, { $sort: { x: 1 } }, { $limit: 5 }]);
  });

  it("goes into an empty pipeline, and a pipeline that is not an array is refused", () => {
    expect(scopePipeline([], READ)).toEqual([filter]);
    expect(() => scopePipeline({} as never, READ)).toThrow(/array/);
  });

  it("goes into a $match with $text too", () => {
    const out = scopePipeline([{ $match: { $text: { $search: "x" } } }], READ);
    expect(out).toEqual([filter, { $match: { $text: { $search: "x" }, _part: "t1" } }]);
  });

  it("goes into the stages that must be first: $geoNear, $search, $vectorSearch", () => {
    expect(scopePipeline([{ $geoNear: { near: [0, 0], query: { kind: "poi" } } }], READ)).toEqual([
      { $geoNear: { near: [0, 0], query: { kind: "poi", _part: "t1" } } },
    ]);
    expect(scopePipeline([{ $vectorSearch: { index: "v", path: "e" } }], READ)[0]).toEqual({ $vectorSearch: { index: "v", path: "e", filter: { _part: "t1" } } });
    const search = scopePipeline([{ $search: { index: "i", text: { query: "q", path: "p" } } }], READ)[0]!["$search"] as Document;
    expect(search).toEqual({ index: "i", compound: { must: [{ text: { query: "q", path: "p" } }], filter: [{ equals: { path: "_part", value: "t1" } }] } });
  });

  it("does not change the pipeline of the caller, and a second scope does not add a second filter", () => {
    const pipeline = [{ $search: { compound: { must: [], filter: [] as Document[] } } }];
    const once = scopePipeline(pipeline, READ);
    const twice = scopePipeline(pipeline, READ);
    expect(pipeline[0]!.$search.compound.filter).toEqual([]);
    expect((once[0]!["$search"] as Document)["compound"].filter).toHaveLength(1);
    expect((twice[0]!["$search"] as Document)["compound"].filter).toHaveLength(1);
  });

  it("refuses $search with a filter that is not an equality", () => {
    expect(() => scopePipeline([{ $search: { text: { query: "q", path: "p" } } }], { match: { _part: { $exists: false } } })).toThrow(/equality/);
  });
});

describe("scopePipeline: the sub-pipelines", () => {
  it("$lookup with localField and foreignField becomes the form with a pipeline and the filter first", () => {
    const lookup = scopePipeline([{ $lookup: { from: "other", localField: "a", foreignField: "b", as: "x" } }], READ)[1]!["$lookup"] as Document;
    expect(lookup).toEqual({
      from: "other",
      as: "x",
      let: { scopeLocalValue: "$a" },
      pipeline: [filter, { $match: { $expr: { $eq: ["$b", "$$scopeLocalValue"] } } }],
    });
    expect(() => scopePipeline([{ $lookup: { from: "other", as: "x" } }], READ)).toThrow(/localField/);
  });

  it("$lookup, $unionWith and $facet with pipelines get the filter in each pipeline, and the caller's stays", () => {
    expect((scopePipeline([{ $lookup: { from: "o", as: "x", pipeline: [{ $limit: 1 }] } }], READ)[1]!["$lookup"] as Document)["pipeline"]).toEqual([filter, { $limit: 1 }]);
    expect(scopePipeline([{ $unionWith: "other" }], READ)[1]).toEqual({ $unionWith: { coll: "other", pipeline: [filter] } });
    const union = { $unionWith: { coll: "o2", pipeline: [{ $limit: 2 }] } };
    expect((scopePipeline([union], READ)[1]!["$unionWith"] as Document)["pipeline"]).toEqual([filter, { $limit: 2 }]);
    expect(union.$unionWith.pipeline).toEqual([{ $limit: 2 }]);
    expect(scopePipeline([{ $facet: { a: [{ $limit: 1 }], b: [] } }], READ)[1]).toEqual({ $facet: { a: [filter, { $limit: 1 }], b: [filter] } });
  });

  it("$graphLookup gets the filter in restrictSearchWithMatch", () => {
    const graph = scopePipeline([{ $graphLookup: { from: "g", startWith: "$a", connectFromField: "a", connectToField: "b", as: "x" } }], READ)[1]!["$graphLookup"] as Document;
    expect(graph["restrictSearchWithMatch"]).toEqual({ _part: "t1" });
  });

  it("a sub-pipeline cannot write, also when the scope permits writes", () => {
    expect(() => scopePipeline([{ $facet: { a: [{ $merge: "t" }] } }], WRITE)).toThrow(/read-only/);
  });
});

describe("scopePipeline: the writes", () => {
  it("refuses $merge without a stamp", () => {
    expect(() => scopePipeline([{ $merge: "t" }], READ)).toThrow(/read-only/);
  });

  it("stamps the documents before $merge, and the match key gets the stamp fields", () => {
    const out = scopePipeline([{ $merge: "target" }], WRITE);
    expect(out.slice(-2)).toEqual([{ $addFields: { _part: "t1" } }, { $merge: { into: "target", on: ["_id", "_part"] } }]);
  });

  it("copies the match key of the caller, and stamps a whenMatched pipeline last", () => {
    const on = ["_id"];
    scopePipeline([{ $merge: { into: "t", on } }], WRITE);
    expect(on).toEqual(["_id"]);
    const merge = scopePipeline([{ $merge: { into: "t", whenMatched: [{ $set: { _part: "t2" } }] } }], WRITE).at(-1)!["$merge"] as Document;
    expect(merge["whenMatched"]).toEqual([{ $set: { _part: "t2" } }, { $addFields: { _part: "t1" } }]);
  });

  it("refuses a $merge into another database", () => {
    expect(() => scopePipeline([{ $merge: { into: { db: "other", coll: "c" } } }], WRITE)).toThrow(/another database/);
  });
});

describe("scopePipeline: the refused surface", () => {
  it("refuses $out, the stages of the server and the JavaScript of the server at each depth", () => {
    expect(() => scopePipeline([{ $out: "c" }], WRITE)).toThrow(/\$out/);
    expect(() => scopePipeline([{ $currentOp: {} }], READ)).toThrow(/not allowed/);
    expect(() => scopePipeline([{ $collStats: {} }], READ)).toThrow(/not allowed/);
    expect(() => scopePipeline([{ $match: { $where: "true" } }], READ)).toThrow(/\$where/);
    expect(() => scopePipeline([{ $project: { x: { $function: { body: "", args: [], lang: "js" } } } }], READ)).toThrow(/\$function/);
    expect(() => scopePipeline([{ $lookup: { from: "o", as: "x", pipeline: [{ $group: { _id: null, v: { $accumulator: {} } } }] } }], READ)).toThrow(/\$accumulator/);
    expect(() => assertNoBlockedOperators([{ a: [{ $where: 1 }] }])).toThrow(/\$where/);
    expect(() => assertNoBlockedOperators("text")).not.toThrow();
  });

  it("refuses $unset of a field of the scope, and passes another $unset", () => {
    expect(() => scopePipeline([{ $unset: "_part" }], READ)).toThrow(/unset/);
    expect(() => scopePipeline([{ $unset: ["a", "_part"] }], READ)).toThrow(/unset/);
    expect(scopePipeline([{ $unset: "a" }], READ)[1]).toEqual({ $unset: "a" });
  });

  it("refuses a stage that does not have exactly one key, so a second key cannot hide a stage", () => {
    for (const stage of [{ $match: {}, $currentOp: {} }, {}, null, [{ $match: {} }]]) {
      expect(() => scopePipeline([stage as never], READ)).toThrow(/exactly one operator/);
    }
  });
});

describe("the limits of an aggregation", () => {
  it("adds a $limit of one more than the result limit, but not after $merge", () => {
    expect(boundPipeline([{ $match: {} }], 3)).toEqual({ pipeline: [{ $match: {} }, { $limit: 4 }], limited: true });
    expect(boundPipeline([{ $merge: "t" }], 3)).toEqual({ pipeline: [{ $merge: "t" }], limited: false });
    expect(boundPipeline([], 3)).toEqual({ pipeline: [{ $limit: 4 }], limited: true });
  });

  it("cuts the result at the limit, and tells the cut", () => {
    expect(cutResults([1, 2, 3, 4], 3, true)).toEqual({ docs: [1, 2, 3], truncated: true });
    expect(cutResults([1, 2, 3], 3, true)).toEqual({ docs: [1, 2, 3], truncated: false });
    expect(cutResults([1, 2, 3, 4], 3, false)).toEqual({ docs: [1, 2, 3, 4], truncated: false });
  });

  it("knows the error of the time limit, and has defaults", () => {
    expect(isTimeLimitError({ code: 50 })).toBe(true);
    expect(isTimeLimitError({ codeName: "MaxTimeMSExpired" })).toBe(true);
    expect(isTimeLimitError(new Error("other"))).toBe(false);
    expect(isTimeLimitError(null)).toBe(false);
    expect(DEFAULT_PIPELINE_LIMITS).toEqual({ maxTimeMS: 10_000, maxResults: 5_000 });
  });
});
