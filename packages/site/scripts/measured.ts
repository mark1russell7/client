/**
 * The measured numbers of the docs pages (CLI-124). A README marks each block of numbers with a template in a comment:
 *
 *   <!-- measured
 *   | Benchmark | Time |
 *   | --- | --- |
 *   | One write | {sqlite.write-1000} |
 *
 *   The numbers come from [the run of {run.date}]({run.url}), on commit `{run.commit}` (`@procedures/sqlite` {engine:@procedures/sqlite}).
 *   -->
 *   The text that GitHub and npm show, with no number.
 *   <!-- /measured -->
 *
 * The site build replaces the block with its template. Each `{<key>}` gets the value of that key in a record `measured/1`, and the
 * other places get the run of that record. Each page with a block gets a data stamp with the limit of its workflow, so
 * the Pages gate holds the age of the numbers. No number of a page is typed text.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_STAMP_SCHEMA, parseDataStamps, type DataStamps, type PageStamp } from "@mark1russell7/site-pages";
import { readRecord, type MeasuredNumber, type MeasuredRecord } from "./measured-record.ts";

/** The age limit of the numbers of each scheduled workflow. The schedule of the workflow must meet it. */
export const MEASURED_LIMITS: Readonly<Record<string, { readonly days: number; readonly reason: string }>> = {
  ".github/workflows/nightly.yml": {
    days: 3,
    reason: "The nightly workflow measures these numbers each day. Three days hold one failed night and its rerun.",
  },
};

/** The form of one block: the template in the comment, then the text for GitHub and npm. */
const BLOCK = /<!-- measured\r?\n([\s\S]*?)\r?\n-->\r?\n([\s\S]*?)<!-- \/measured -->/g;

/** The form of one place of a template. */
const PLACE = /\{([A-Za-z0-9@/._:-]+)\}/g;

/** The run of one block, as the data stamp of its page names it. */
export type MeasuredStampRun = PageStamp["runs"][number] & { readonly workflow: string };

/** The result of `fillMeasured`. */
export interface FilledMarkdown {
  readonly markdown: string;
  /** The run of each filled block, once for each run. */
  readonly runs: readonly MeasuredStampRun[];
}

/** This function gives a time in ms as text: two decimals under 10 ms, one under 100 ms, and whole numbers after. */
export function formatMs(value: number): string {
  if (value < 10) return `${value.toFixed(2)} ms`;
  if (value < 100) return `${value.toFixed(1)} ms`;
  return `${Math.round(value).toLocaleString("en-US")} ms`;
}

/** This function gives the text of one number. */
function formatNumber(number: MeasuredNumber): string {
  return formatMs(number.value);
}

/** This function reads each record of a folder. It throws when two records have the same key. */
export function readMeasured(folder: string): MeasuredRecord[] {
  const records = readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => readRecord(join(folder, name)));
  if (records.length === 0) throw new Error(`${folder}: no record of measured numbers`);
  const owners = new Map<string, string>();
  for (const record of records) {
    for (const key of Object.keys(record.numbers)) {
      const other = owners.get(key);
      if (other !== undefined) throw new Error(`the key ${key} is in the records of the runs ${other} and ${record.run.id}`);
      owners.set(key, record.run.id);
    }
  }
  return records;
}

/** This function fills the template of one block from the record that holds its numbers. */
function fillTemplate(template: string, records: readonly MeasuredRecord[], where: string): { text: string; record: MeasuredRecord } {
  const keys = [...template.matchAll(PLACE)].map((match) => match[1] ?? "").filter((key) => !key.startsWith("run.") && !key.startsWith("engine:"));
  if (keys.length === 0) throw new Error(`${where}: a measured block has no number`);
  const holders = new Set(
    keys.map((key) => {
      const holder = records.find((record) => key in record.numbers);
      if (holder === undefined) throw new Error(`${where}: no record has the number ${key}`);
      return holder;
    }),
  );
  if (holders.size > 1) throw new Error(`${where}: the numbers of one block come from ${holders.size} runs`);
  const [record] = [...holders] as [MeasuredRecord];
  const run: Record<string, string> = {
    "run.id": record.run.id,
    "run.url": record.run.url,
    "run.date": record.run.date.slice(0, 10),
    "run.commit": record.run.commit.slice(0, 8),
    "run.limit": String(limitOf(record.run.workflow, where).days),
  };
  const text = template.replace(PLACE, (_, key: string) => {
    if (key in run) return run[key] as string;
    if (key.startsWith("engine:")) {
      const version = record.engines[key.slice("engine:".length)];
      if (version === undefined) throw new Error(`${where}: the run ${record.run.id} names no version of ${key.slice("engine:".length)}`);
      return version;
    }
    if (key.startsWith("run.")) throw new Error(`${where}: the place {${key}} is not known`);
    return formatNumber(record.numbers[key] as MeasuredNumber);
  });
  return { text, record };
}

/** This function gives the limit of a workflow. It throws for a workflow with no limit. */
function limitOf(workflow: string, where: string): { readonly days: number; readonly reason: string } {
  const limit = MEASURED_LIMITS[workflow];
  if (limit === undefined) throw new Error(`${where}: the workflow ${workflow} has no limit in MEASURED_LIMITS`);
  return limit;
}

/**
 * This function fills each measured block of a README. With no records, each block gives its text for GitHub and npm,
 * and the page gets no stamp. With records, each block must fill.
 */
export function fillMeasured(markdown: string, records: readonly MeasuredRecord[] | undefined, where: string): FilledMarkdown {
  const runs = new Map<string, MeasuredStampRun>();
  const filled = markdown.replace(BLOCK, (_, template: string, fallback: string) => {
    // The text of a block ends before the line break of its end mark, so the page keeps its blank lines.
    if (records === undefined) return fallback.replace(/\r?\n$/, "");
    const { text, record } = fillTemplate(template, records, where);
    runs.set(record.run.id, { id: record.run.id, url: record.run.url, date: record.run.date, engines: record.engines, commit: record.run.commit, workflow: record.run.workflow });
    return text;
  });
  if (filled.includes("<!-- measured") || filled.includes("<!-- /measured -->")) throw new Error(`${where}: a measured block has no end, or no template`);
  return { markdown: filled, runs: [...runs.values()] };
}

/** This function gives the data stamp of a page from the runs of its blocks. All runs of a page come from one workflow. */
export function stampOfPage(page: string, runs: readonly MeasuredStampRun[]): PageStamp {
  const workflows = new Set(runs.map((run) => run.workflow));
  if (workflows.size !== 1) throw new Error(`${page}: the numbers of a page come from one workflow, not ${workflows.size}`);
  const [workflow] = [...workflows] as [string];
  const { days, reason } = limitOf(workflow, page);
  return { page, runs: runs.map(({ workflow: _workflow, ...run }) => run), limit: { days, reason, workflow } };
}

/**
 * This function joins the fixed stamps of the site and the stamps of the measured pages. It throws on a page in both, or a
 * fault. The fixed file can have no page, so the function parses only the joined stamps.
 */
export function joinStamps(fixed: { readonly schema?: unknown; readonly pages?: unknown }, measured: readonly PageStamp[]): DataStamps {
  if (fixed.schema !== DATA_STAMP_SCHEMA || !Array.isArray(fixed.pages)) throw new Error(`the fixed data stamps are not a file ${DATA_STAMP_SCHEMA}`);
  const fixedPages = fixed.pages as readonly { readonly page?: unknown }[];
  const pages = new Set(fixedPages.map((stamp) => stamp.page));
  for (const stamp of measured) if (pages.has(stamp.page)) throw new Error(`${stamp.page} has a fixed stamp and measured numbers`);
  const joined = { schema: DATA_STAMP_SCHEMA, pages: [...fixedPages, ...measured] };
  const check = parseDataStamps(joined);
  if (!check.ok) throw new Error(`the data stamps have faults: ${check.faults.join(" ")}`);
  return check.stamps;
}
