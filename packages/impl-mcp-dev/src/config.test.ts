/**
 * The time limit of a tool call comes from MCP_TOOL_TIMEOUT_MS (roadmap 1.2).
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_TOOL_TIMEOUT_MS, loadConfig, parseTimeout } from "./config.js";

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

describe("MCP_FS_ROOT (roadmap R33)", () => {
  it("gives the root of the fs procedures, and no root when it is empty or not set", () => {
    const before = process.env["MCP_FS_ROOT"];
    try {
      delete process.env["MCP_FS_ROOT"];
      expect(loadConfig().fsRoot).toBeUndefined();
      process.env["MCP_FS_ROOT"] = "  ";
      expect(loadConfig().fsRoot).toBeUndefined();
      process.env["MCP_FS_ROOT"] = " /work/data ";
      expect(loadConfig().fsRoot).toBe("/work/data");
    } finally {
      if (before === undefined) delete process.env["MCP_FS_ROOT"];
      else process.env["MCP_FS_ROOT"] = before;
    }
  });
});

describe("MCP_PROGRAM_CHECK (roadmap R22)", () => {
  it("is on by default, and false or 0 turns it off", () => {
    const before = process.env["MCP_PROGRAM_CHECK"];
    try {
      delete process.env["MCP_PROGRAM_CHECK"];
      expect(loadConfig().programCheck).toBe(true);
      for (const off of ["false", "0"]) {
        process.env["MCP_PROGRAM_CHECK"] = off;
        expect(loadConfig().programCheck).toBe(false);
      }
      process.env["MCP_PROGRAM_CHECK"] = "true";
      expect(loadConfig().programCheck).toBe(true);
    } finally {
      if (before === undefined) delete process.env["MCP_PROGRAM_CHECK"];
      else process.env["MCP_PROGRAM_CHECK"] = before;
    }
  });
});
