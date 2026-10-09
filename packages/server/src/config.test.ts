/**
 * The options of the server CLI (deep dive CLI-16): invalid values are errors, and the order
 * of the options does not matter.
 */

import { describe, it, expect } from "vitest";
import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  it("gives a loopback HTTP server by default", () => {
    expect(parseConfig([])).toEqual({
      procedures: [],
      transports: [{ type: "http", port: 3000, host: "127.0.0.1", basePath: "/api" }],
      verbose: false,
    });
  });

  it("reads the options in any order", () => {
    const config = parseConfig(["--cors", "--port=4000", "-t", "http,websocket", "--host", "::1", "-p", "a,b"]);
    expect(config.procedures).toEqual(["a", "b"]);
    expect(config.transports).toEqual([
      { type: "http", port: 4000, host: "::1", basePath: "/api", cors: true },
      { type: "websocket", port: 3001, host: "::1", path: "/ws" },
    ]);
  });

  it("reports an invalid port, a missing value, an unknown transport and an unknown option", () => {
    expect(() => parseConfig(["--port", "abc"])).toThrow('Invalid port: "abc"');
    expect(() => parseConfig(["--port", "70000"])).toThrow('Invalid port: "70000"');
    expect(() => parseConfig(["--port"])).toThrow("--port needs a value");
    expect(() => parseConfig(["--host", "--verbose"])).toThrow("--host needs a value");
    expect(() => parseConfig(["-t", "udp"])).toThrow('Unknown transport: "udp"');
    expect(() => parseConfig(["--bogus"])).toThrow("Unknown option: --bogus");
  });
});
