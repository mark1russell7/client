/**
 * The public API of `@procedures/client` (roadmap R30). The test reads the `.d.ts` files of each
 * entry of the `exports` field in `dist/`, and compares the names and their declarations with
 * `test/api/public-api.txt`. A change of the API fails here, so each change is a decision.
 *
 * To accept an intended change, start the tests with `UPDATE_API_SNAPSHOT=1` and review the diff
 * of the file. The test reads `dist/`: start `pnpm build` first, as CI does.
 */

import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apiReport, statementsOf } from "../test/api/report.js";

const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = join(PACKAGE, "test", "api", "public-api.txt");
const UPDATE = process.env["UPDATE_API_SNAPSHOT"] === "1";

interface Manifest {
  name: string;
  exports: Record<string, { types: string }>;
}

describe("the public API of @procedures/client (R30)", () => {
  it("the declarations of each entry agree with test/api/public-api.txt", () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as Manifest;
    const entries = Object.entries(manifest.exports).map(([subpath, target]) => ({ subpath, types: target.types }));
    for (const entry of entries) {
      expect(existsSync(join(PACKAGE, entry.types)), `${entry.types} is missing: start pnpm build first`).toBe(true);
    }
    const report = apiReport(manifest.name, PACKAGE, entries);
    if (UPDATE || !existsSync(SNAPSHOT)) {
      mkdirSync(dirname(SNAPSHOT), { recursive: true });
      writeFileSync(SNAPSHOT, report);
    }
    // A checkout with CRLF line ends gives the same text
    expect(report).toBe(readFileSync(SNAPSHOT, "utf8").replace(/\r\n/g, "\n"));
  });
});

describe("the reader of the declaration files (R30)", () => {
  it("splits the statements, and drops the comments and the blank lines", () => {
    const source = [
      "/** The doc. */\r",
      'export declare const a: "x;y" | `${string};${number}`; // a comment',
      "export interface B {\r",
      "    /** A member. */",
      "    c: { d: string };",
      "",
      "}",
      'export { e as f } from "./g.js";',
      "export declare class H<T = {}> extends I<{ j: () => void }> {",
      "    k: T;",
      "}",
      "export type L = (m: number) => { n: 1 };",
      "//# sourceMappingURL=x.d.ts.map",
    ].join("\n");
    expect(statementsOf(source)).toEqual([
      'export declare const a: "x;y" | `${string};${number}`;',
      "export interface B {\n    c: { d: string };\n}",
      'export { e as f } from "./g.js";',
      "export declare class H<T = {}> extends I<{ j: () => void }> {\n    k: T;\n}",
      "export type L = (m: number) => { n: 1 };",
    ]);
  });
});
