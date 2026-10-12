// The types of status-data.mjs, for the TypeScript tests of the site.

import type { CommitLink, Finding, JulyRegister, RoadmapItem, Severity, StatusArea, StatusData } from "../src/data/index";

export declare const STATUSES: readonly string[];
export declare const SEVERITIES: readonly Severity[];
export declare class StatusParseError extends Error {}

export interface HashRecord {
  hash: string;
  /** A repository name next to the hash, or null. */
  adjacent: string | null;
  /** The last repository name of the cell, or null. */
  named: string | null;
}

export interface TableRow {
  line: number;
  cells: Record<string, string>;
}

export interface Table {
  section: string;
  line: number;
  header: string[];
  rows: TableRow[];
}

export declare function splitRow(line: string): string[];
export declare function readTables(markdown: string, file: string): Table[];
export declare function areaOf(title: string): { slug: string; label: string };
export declare function statusOf(cell: string, where: string): string;
export declare function severityOf(cell: string | undefined): Severity | null;
export declare function hashesOf(cell: string): HashRecord[];
export declare function repoOf(record: HashRecord, inThisRepo: boolean | null): string;
export declare function commitResolver(cwd: string): { resolve: (record: HashRecord) => CommitLink; finish: () => void };
export declare function idsOf(cell: string): string[];
export declare function parseDeepDive(
  markdown: string,
  file: string,
  resolve: (record: HashRecord) => CommitLink,
): { areas: StatusArea[]; findings: Finding[]; roadmap: RoadmapItem[] };
export declare function parseJulyRegister(markdown: string, file: string, resolve: (record: HashRecord) => CommitLink): JulyRegister;
export declare function readStatusData(packagesDir: string, repoDir: string): StatusData;
