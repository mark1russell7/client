// Tests of the pure parts of the server request bench (O90). No test starts a process or times code.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { caseOf, markdownOf, REQUESTS, SHARE_BOOTSTRAP, shareOf } from "./server-request.ts";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-12;

describe("server-request", () => {
  it("gives the share: the median of the exec samples over the median of the request samples", () => {
    // The per-process medians of 5 rounds, in microseconds (the unit has no effect on the share)
    const s = shareOf([100, 120, 80, 110, 90], [5, 6, 4, 7, 3]);
    assert.equal(s.rounds, 5);
    assert.ok(near(s.request.median, 100));
    assert.ok(near(s.exec.median, 5));
    assert.ok(near(s.share, 0.05));
    assert.deepEqual(s.samples.request, [100, 120, 80, 110, 90]);
    assert.deepEqual(s.samples.exec, [5, 6, 4, 7, 3]);
  });

  it("gives the bootstrap interval of the share: 10 000 runs, seed 1, around the share", () => {
    const s = shareOf([100, 120, 80, 110, 90], [5, 6, 4, 7, 3]);
    assert.ok(near(s.interval.estimate, s.share));
    assert.equal(s.interval.runs, SHARE_BOOTSTRAP.runs);
    assert.equal(s.interval.seed, SHARE_BOOTSTRAP.seed);
    assert.equal(s.interval.level, 0.95);
    assert.equal(s.interval.finite, SHARE_BOOTSTRAP.runs);
    assert.ok(s.interval.low <= s.share && s.share <= s.interval.high);
    assert.ok(s.interval.low < s.interval.high);
    // The same samples give the same interval: the seed fixes the draws
    assert.deepEqual(shareOf([100, 120, 80, 110, 90], [5, 6, 4, 7, 3]).interval, s.interval);
  });

  it("gives an interval of one point when the samples do not vary", () => {
    const s = shareOf([2, 2, 2, 2], [0.5, 0.5, 0.5, 0.5]);
    assert.ok(near(s.interval.low, 0.25));
    assert.ok(near(s.interval.high, 0.25));
  });

  it("gives the round-paired ratios exec / request, and their p10 to p90", () => {
    const s = shareOf([1, 2, 4, 5, 10], [0.1, 0.1, 0.2, 0.5, 0.5]);
    assert.deepEqual(s.paired, [0.1, 0.05, 0.05, 0.1, 0.05]);
    assert.ok(near(s.pairedBand.median, 0.05));
    assert.ok(near(s.pairedBand.p10, 0.05));
    assert.ok(near(s.pairedBand.p90, 0.1));
    // The share of the medians is not the median of the round ratios
    assert.ok(near(s.share, 0.2 / 4));
  });

  it("pairs only the rounds that both arms have", () => {
    const s = shareOf([1, 2, 3], [0.5, 1]);
    assert.equal(s.rounds, 2);
    assert.deepEqual(s.paired, [0.5, 0.5]);
  });

  it("gives the A/A band of the request arm from the input of a paired-time/1 report", () => {
    const input = {
      id: "one-call",
      ms: { request: [1, 2, 4], exec: [0.1, 0.2, 0.4], "request~aa": [1.1, 1.8, 4] },
      median: { request: 2, exec: 0.2, "request~aa": 1.8 },
      ratio: { exec: 0.1, "request~aa": 0.9 },
    };
    const c = caseOf(input);
    assert.ok(near(c.share, 0.1));
    assert.ok(c.aa !== null);
    assert.equal(c.aa.ratio, 0.9);
    assert.ok(near(c.aa.band.median, 1));
    assert.ok(caseOf({ ...input, ms: { request: [1], exec: [0.1] } }).aa === null);
  });

  it("gives a Markdown table for each case, and says that the requests are synthetic", () => {
    const cases = { "one-call": caseOf({ id: "one-call", ms: { request: [0.1, 0.1, 0.1], exec: [0.005, 0.005, 0.005], "request~aa": [0.1, 0.1, 0.1] }, median: {}, ratio: { "request~aa": 1 } }) };
    const md = markdownOf({ refs: { head: "abc" }, node: "v26.0.0", rounds: 20, warmupPasses: 1, requests: REQUESTS, cases });
    assert.ok(md.includes("The requests are synthetic: no record of real traffic exists (O91)."));
    assert.ok(md.includes("The share interval is the 95 % percentile bootstrap of rigor-statistics: 10000 runs, seed 1."));
    assert.ok(md.includes("## `one-call`"));
    assert.ok(md.includes(`Each process: ${REQUESTS["one-call"].warmup} warm-up calls, then ${REQUESTS["one-call"].calls} timed calls.`));
    assert.ok(md.includes("| Request median µs | Exec median µs | Share | Share 95 % interval | Round-paired p10 to p90 | A/A p10 to p90 |"));
    assert.ok(md.includes("| 100.0 | 5.0 | 5.0 % | 5.0 % to 5.0 % | 5.0 % to 5.0 % | 1.000 to 1.000 |"));
  });
});
