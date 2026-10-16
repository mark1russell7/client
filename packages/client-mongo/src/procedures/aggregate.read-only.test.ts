/**
 * mongo.documents.aggregate only reads (CAP-2, roadmap R7): it refuses $out and $merge, also in
 * the pipeline of $facet, $lookup and $unionWith. Before, it declared that it writes, so a
 * read-only session refused each aggregation.
 */

import { describe, it, expect } from "vitest";
import { aggregateProcedure, writingStage } from "./documents.aggregate.js";

describe("writingStage", () => {
  it("finds $out and $merge at any depth", () => {
    expect(writingStage([{ $match: { a: 1 } }, { $out: "copy" }])).toBe("$out");
    expect(writingStage([{ $merge: { into: "x" } }])).toBe("$merge");
    expect(writingStage([{ $facet: { a: [{ $match: {} }, { $merge: { into: "x" } }] } }])).toBe("$merge");
    expect(writingStage([{ $lookup: { from: "b", pipeline: [{ $out: "y" }], as: "c" } }])).toBe("$out");
  });

  it("finds nothing in a pipeline that only reads", () => {
    expect(writingStage([{ $match: { out: "$out is a value here" } }, { $group: { _id: "$a", n: { $sum: 1 } } }])).toBeUndefined();
  });
});

describe("mongo.documents.aggregate", () => {
  it("declares that it changes nothing", () => {
    expect(aggregateProcedure.metadata?.effects?.writes).toEqual([]);
  });

  it("refuses a writing stage before it connects", async () => {
    await expect(
      aggregateProcedure.handler!({ collection: "c", pipeline: [{ $out: "copy" }] } as never, {} as never),
    ).rejects.toThrow("the stage $out writes to a collection");
  });
});
