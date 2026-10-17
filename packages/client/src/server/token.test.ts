/**
 * The token check of the server (`tokenMatches`). The comparison reads each character of the
 * expected token for each presented token, so a token of another length takes the same path.
 */

import { describe, expect, it } from "vitest";
import { tokenMatches } from "./procedure-server.js";

describe("tokenMatches", () => {
  it("accepts only the expected token", () => {
    expect(tokenMatches("s3cret-token", "s3cret-token")).toBe(true);
    expect(tokenMatches("s3cret-token", "s3cret-tokeN")).toBe(false);
    expect(tokenMatches("s3cret-token", undefined)).toBe(false);
  });

  it("refuses a token of another length, also a prefix and an extension of the expected one", () => {
    expect(tokenMatches("abc", "ab")).toBe(false);
    expect(tokenMatches("abc", "abcd")).toBe(false);
    expect(tokenMatches("abc", "")).toBe(false);
    expect(tokenMatches("abc", "abc\u0000")).toBe(false);
  });

  it("compares the characters beyond the first 8 bits", () => {
    expect(tokenMatches("töken-€", "töken-€")).toBe(true);
    expect(tokenMatches("töken-€", "töken-₭")).toBe(false);
  });
});
