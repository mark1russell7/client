import type { PairedTime } from "@mark1russell7/rigor-bench";
import { poolRecords } from "@mark1russell7/rigor-bench";
import { describe, expect, it } from "vitest";
import { mergeJobFiles, type JobFile } from "./tenant-jobs.js";

/** This function gives the records of one case of a job. Each job starts at its own round, as `roundOffset` of a job does. */
const records = (job: string, name: string): PairedTime[] =>
  [0, 1].map((step) => (Number(job) - 1) * 2 + step).map((round) => ({ case: name, round, first: round % 2 === 0 ? ("a" as const) : ("b" as const), a: 10, b: 11, job }));

/** This function gives the file of a CI job that holds one case. */
const file = (job: string, name: string, base = "control"): JobFile => ({
  job,
  env: { runner: `${job}/${name}` },
  candidate: records(job, name),
  aa: records(job, name),
  base,
  pairs: { partition: records(job, name), "control~aa": records(job, name) },
});

describe("the job files of the tenant bench", () => {
  it("joins the files of one job, so the pool takes a job with one file for each case", () => {
    const files = [file("1", "800-p1"), file("1", "8000-p2"), file("2", "800-p1"), file("2", "8000-p2")];
    expect(() => poolRecords(files)).toThrow(/two jobs have the label/);
    const jobs = mergeJobFiles(files);
    expect(jobs.map((job) => job.job)).toEqual(["1", "2"]);
    expect(jobs[0]!.candidate.map((record) => record.case)).toEqual(["800-p1", "800-p1", "8000-p2", "8000-p2"]);
    expect(jobs[0]!.pairs?.["partition"]).toHaveLength(4);
    expect(jobs[0]!.env).toEqual([{ runner: "1/800-p1" }, { runner: "1/8000-p2" }]);
    expect(jobs[0]!.base).toBe("control");
    expect(poolRecords(jobs).candidate).toHaveLength(8);
  });

  it("keeps a job with one file as it is", () => {
    const one = file("1", "800-p1");
    expect(mergeJobFiles([one])).toEqual([one]);
  });

  it("refuses two files of one job with the same case, or with two bases", () => {
    expect(() => mergeJobFiles([file("1", "800-p1"), file("1", "800-p1")])).toThrow("two files of the job 1 have the case 800-p1");
    expect(() => mergeJobFiles([file("1", "800-p1"), file("1", "800-p2", "store")])).toThrow("have the bases control, store");
  });
});
