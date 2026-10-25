/**
 * The route of the HTTP server transport: each character of the base path matches only itself,
 * also a backslash or another special character of a regular expression.
 */

import { describe, expect, it } from "vitest";
import express from "express";
import { ProcedureServer } from "../../../server/procedure-server.js";
import { HttpServerTransport, basePathRoute } from "./transport.js";

describe("basePathRoute", () => {
  it("matches the paths under the default base path, and the base path itself only when the addressing takes it", () => {
    expect(basePathRoute("/api", false).test("/api/notes/echo")).toBe(true);
    expect(basePathRoute("/api", false).test("/api")).toBe(false);
    expect(basePathRoute("/api", false).test("/apix/notes")).toBe(false);
    expect(basePathRoute("/api", true).test("/api")).toBe(true);
    expect(basePathRoute("/api", true).test("/api/notes")).toBe(true);
    expect(basePathRoute("/api/", true).test("/api")).toBe(true);
    expect(basePathRoute("/api", true).test("/apix")).toBe(false);
  });

  it("matches a backslash of the base path only as a backslash", () => {
    // Before the fix, "\d" of the base path was a digit class of the regular expression
    const route = basePathRoute("/v\\d", false);
    expect(route.test("/v1/notes")).toBe(false);
    expect(route.test("/v\\d/notes")).toBe(true);
  });

  it("matches the other special characters of the base path only as themselves", () => {
    expect(basePathRoute("/api.v1", false).test("/apixv1/notes")).toBe(false);
    expect(basePathRoute("/api.v1", false).test("/api.v1/notes")).toBe(true);
    expect(basePathRoute("/a+", true).test("/aa")).toBe(false);
    expect(basePathRoute("/a+", true).test("/a+")).toBe(true);
    expect(basePathRoute("/a(b", false).test("/a(b/notes")).toBe(true);
  });

  it("lets the transport start its route with a base path that has a parenthesis", () => {
    expect(() => new HttpServerTransport(new ProcedureServer(), { app: express(), basePath: "/a(b" })).not.toThrow();
  });
});
