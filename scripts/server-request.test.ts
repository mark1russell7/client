// Tests of the pure parts of the server request bench (O90). No test starts a process or times code.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markdownOf, quantileOf, recordOf, timesOf } from "./server-request.ts";

describe("server-request", () => {
  it("gives a quantile with a linear step between two values", () => {
    assert.equal(quantileOf([1, 2, 3, 4, 5], 0.5), 3);
    assert.equal(quantileOf([1, 2, 3, 4], 0.5), 2.5);
    assert.ok(Math.abs(quantileOf([0, 10], 0.9) - 9) < 1e-12);
    assert.ok(Number.isNaN(quantileOf([], 0.5)));
  });

  it("gives the quantiles and the mean of unsorted times", () => {
    const t = timesOf([5, 1, 3, 2, 4]);
    assert.equal(t.calls, 5);
    assert.equal(t.median, 3);
    assert.equal(t.mean, 3);
    assert.ok(Math.abs(t.p10 - 1.4) < 1e-12);
    assert.ok(Math.abs(t.p90 - 4.6) < 1e-12);
  });

  it("gives the share of the exec: the median exec time over the median request time", () => {
    const r = recordOf([0.1, 0.1, 0.1], [0.005, 0.005, 0.005]);
    assert.ok(Math.abs(r.execShare - 0.05) < 1e-12);
    const md = markdownOf("abc", { "one-call": r });
    assert.ok(md.includes("Synthetic requests"));
    assert.ok(md.includes("| `one-call` | 100.0 | 100.0 to 100.0 | 5.0 | 5.0 to 5.0 | 5.0 % |"));
  });
});
