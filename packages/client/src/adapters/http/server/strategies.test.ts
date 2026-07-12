import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { defaultUrlPattern, postOnlyStrategy, HTTPMethod } from "../shared/index.js";
import { patternServerUrlStrategy, createPatternServerUrlStrategy } from "./strategies.js";

// C3 / bug 16: the raw HTTP client and server defaults were mutually incompatible and the client
// dropped the request payload for get/list/find/watch (mapped to GET). The fix defaults the client
// to POST (payload always in the body) and the server to a pattern strategy that is the exact
// inverse of the client's URL format. These tests pin both halves.

function mockReq(path: string, method = "POST"): Request {
  return { path, method, query: {}, params: {}, headers: {} } as unknown as Request;
}

describe("HTTP C3: payload-safe + routable defaults (BUGS-2026-07 C3 / bug 16)", () => {
  it("client default method strategy is POST-only, so the payload is never dropped", () => {
    // Under the old restful strategy, list/find/get/watch became GET and their body was dropped.
    for (const operation of ["list", "find", "get", "watch", "create", "scan"]) {
      expect(postOnlyStrategy({ service: "data", operation })).toBe(HTTPMethod.POST);
    }
  });

  it("server pattern strategy round-trips the client's default URL format", () => {
    const method = { service: "collections.users", operation: "list" };
    const url = defaultUrlPattern.format(method, "/api"); // what the HTTP client emits
    const path = url.split("?")[0] ?? url; // strip any query
    expect(patternServerUrlStrategy(mockReq(path))).toEqual({
      service: "collections.users",
      operation: "list",
    });
  });

  it("respects a custom base path", () => {
    const method = { service: "svc", operation: "op" };
    const url = defaultUrlPattern.format(method, "/v2/api");
    const strat = createPatternServerUrlStrategy("/v2/api");
    expect(strat(mockReq(url.split("?")[0] ?? url))).toEqual({ service: "svc", operation: "op" });
  });

  it("returns null for a path that is not a valid service/operation", () => {
    expect(patternServerUrlStrategy(mockReq("/api/onlyone"))).toBeNull();
  });
});
