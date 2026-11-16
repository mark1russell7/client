/**
 * The deprecation warning of the engine `sqljs`. Each test imports a new copy of `engines.ts`, so
 * each test starts with no warning in the process. `engines.fallback.test.ts` tests the warning of
 * the engine `auto` on a Node.js without `node:sqlite`.
 */

import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { isNodeSqliteAvailable, type SqliteEngine } from "./engines.js";

const nodeAvailable = await isNodeSqliteAvailable();

let emit: MockInstance<typeof process.emitWarning> | undefined;

afterEach(() => {
  emit?.mockRestore();
  emit = undefined;
});

/** A warning of the process: its text and its type. */
interface Warning {
  readonly text: string;
  readonly type: string | undefined;
}

/**
 * This function opens a database in memory a number of times with a new copy of the module. It
 * gives the deprecation warnings of the engine `sqljs`.
 */
async function sqlJsWarnings(engine: SqliteEngine, opens: number): Promise<Warning[]> {
  vi.resetModules();
  emit = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
  const engines = await import("./engines.js");
  for (let open = 0; open < opens; open += 1) {
    (await engines.openEngine(engines.MEMORY_PATH, engine, 1_000)).close();
  }
  const warnings: Warning[] = [];
  for (const [warning, options] of emit.mock.calls) {
    if (typeof options === "object" && options.code === "PROCEDURES_SQLITE_SQLJS") {
      warnings.push({ text: String(warning), type: options.type });
    }
  }
  return warnings;
}

describe("The deprecation warning of the engine sqljs", () => {
  it("the engine sqljs gives one DeprecationWarning in a process, with the version that removes it", async () => {
    const warnings = await sqlJsWarnings("sqljs", 3);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.type).toBe("DeprecationWarning");
    expect(warnings[0]?.text).toMatch(/The SQLite engine sqljs is deprecated/);
    expect(warnings[0]?.text).toMatch(/0\.61\.0/);
    expect(warnings[0]?.text).toMatch(/Node\.js 22\.13 or later/);
  });

  it.runIf(nodeAvailable)("the engines node and auto give no warning when Node.js has node:sqlite", async () => {
    expect(await sqlJsWarnings("node", 2)).toEqual([]);
    expect(await sqlJsWarnings("auto", 2)).toEqual([]);
  });
});
