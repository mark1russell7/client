/**
 * The print helpers write each kind of message to the console, and a table with a header row.
 */

import { afterEach, beforeEach, describe, it, expect, vi, type MockInstance } from "vitest";
import { print } from "./print.js";

let log: MockInstance<typeof console.log>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  error = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const logged = (): string => log.mock.calls.map((call: unknown[]) => String(call[0] ?? "")).join("\n");

describe("print", () => {
  it("writes each kind of message", () => {
    print.info("info");
    print.success("done");
    print.warning("careful");
    print.muted("quiet");
    print.highlight("loud");
    print.divider();
    print.newline();
    const text = logged();
    for (const part of ["info", "✓ done", "⚠ careful", "quiet", "loud", "─"]) {
      expect(text).toContain(part);
    }
    expect(log).toHaveBeenCalledTimes(7);
  });

  it("writes an error to stderr", () => {
    print.error("broken");
    expect(String(error.mock.calls[0]?.[0])).toContain("✗ broken");
  });

  it("writes a table with its header row and its rows", () => {
    print.table([
      ["name", "size"],
      ["a", "1"],
    ]);
    const text = logged();
    expect(text).toContain("name");
    expect(text).toContain("a");
  });

  it("writes nothing for an empty table", () => {
    print.table([]);
    expect(log).not.toHaveBeenCalled();
  });
});
