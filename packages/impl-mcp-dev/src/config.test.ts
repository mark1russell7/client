/**
 * The time limit of a tool call comes from MCP_TOOL_TIMEOUT_MS (roadmap 1.2).
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_TOOL_TIMEOUT_MS, loadConfig, parseMaxSessions, parseTimeout } from "./config.js";

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

describe("MCP_HTTP_MAX_SESSIONS (CLI-51)", () => {
  it("reads the session limit, and Infinity turns it off", () => {
    expect(parseMaxSessions("64")).toBe(64);
    expect(parseMaxSessions(" 512 ")).toBe(512);
    expect(parseMaxSessions("Infinity")).toBe(Number.POSITIVE_INFINITY);
  });

  it("gives undefined for a missing value, so the face keeps its default of 256", () => {
    expect(parseMaxSessions(undefined)).toBeUndefined();
    expect(parseMaxSessions("  ")).toBeUndefined();
  });

  it("goes to the HTTP options of the configuration", () => {
    const before = { port: process.env["MCP_HTTP_PORT"], max: process.env["MCP_HTTP_MAX_SESSIONS"] };
    try {
      process.env["MCP_HTTP_PORT"] = "3003";
      delete process.env["MCP_HTTP_MAX_SESSIONS"];
      expect(loadConfig().http?.maxSessions).toBeUndefined();
      process.env["MCP_HTTP_MAX_SESSIONS"] = "32";
      expect(loadConfig().http).toMatchObject({ port: 3003, maxSessions: 32 });
    } finally {
      if (before.port === undefined) delete process.env["MCP_HTTP_PORT"];
      else process.env["MCP_HTTP_PORT"] = before.port;
      if (before.max === undefined) delete process.env["MCP_HTTP_MAX_SESSIONS"];
      else process.env["MCP_HTTP_MAX_SESSIONS"] = before.max;
    }
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
