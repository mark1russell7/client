/**
 * The time limit of a tool call comes from MCP_TOOL_TIMEOUT_MS (roadmap 1.2).
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_TOOL_TIMEOUT_MS, parseTimeout } from "./config.js";

describe("parseTimeout", () => {
  it("reads milliseconds, and 0 turns the limit off", () => {
    expect(parseTimeout("30000")).toBe(30000);
    expect(parseTimeout("0")).toBe(0);
  });

  it("gives the default for a missing or invalid value", () => {
    expect(parseTimeout(undefined)).toBe(DEFAULT_TOOL_TIMEOUT_MS);
    expect(parseTimeout("")).toBe(DEFAULT_TOOL_TIMEOUT_MS);
    expect(parseTimeout("ten")).toBe(DEFAULT_TOOL_TIMEOUT_MS);
    expect(parseTimeout("-5")).toBe(DEFAULT_TOOL_TIMEOUT_MS);
  });
});
