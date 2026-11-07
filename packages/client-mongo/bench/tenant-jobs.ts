/**
 * The job files of the tenant bench. A CI job can hold one case (`--case`), so one job of the plan can give one file
 * for each case. `mergeJobFiles` joins the files of one job, because `poolRecords` refuses two jobs with one label.
 */

import type { PairedTime } from "@mark1russell7/rigor-bench";

/** One file of a job. */
export interface JobFile {
  readonly job: string;
  readonly env: unknown;
  readonly candidate: readonly PairedTime[];
  readonly aa: readonly PairedTime[];
  readonly base?: string;
  readonly pairs?: Readonly<Record<string, readonly PairedTime[]>>;
}

/**
 * This function joins the files of each job label into one file. The records join in the order of the files. The `env`
 * of a joined job is the list of the `env` of its files, because each file comes from its own runner.
 */
export function mergeJobFiles(files: readonly JobFile[]): JobFile[] {
  const byJob = new Map<string, JobFile[]>();
  for (const file of files) byJob.set(file.job, [...(byJob.get(file.job) ?? []), file]);
  return [...byJob.entries()].map(([job, own]) => {
    if (own.length === 1) return own[0]!;
    const bases = new Set(own.map((file) => file.base));
    if (bases.size > 1) throw new RangeError(`mergeJobFiles: the files of the job ${job} have the bases ${[...bases].join(", ")}`);
    const cases = new Set<string>();
    for (const file of own) {
      const fileCases = new Set(file.candidate.map((record) => record.case));
      for (const name of fileCases) {
        if (cases.has(name)) throw new RangeError(`mergeJobFiles: two files of the job ${job} have the case ${name}`);
        cases.add(name);
      }
    }
    const arms = [...new Set(own.flatMap((file) => Object.keys(file.pairs ?? {})))];
    const pairs = own.every((file) => file.pairs === undefined)
      ? undefined
      : Object.fromEntries(arms.map((arm) => [arm, own.flatMap((file) => file.pairs?.[arm] ?? [])]));
    return {
      job,
      env: own.map((file) => file.env),
      candidate: own.flatMap((file) => file.candidate),
      aa: own.flatMap((file) => file.aa),
      ...(own[0]!.base === undefined ? {} : { base: own[0]!.base }),
      ...(pairs === undefined ? {} : { pairs }),
    };
  });
}
