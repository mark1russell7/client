/**
 * The server.* procedures validate their input (before, the schemas passed anything through).
 */

import { describe, it, expect } from "vitest";
import {
  serverCallInputSchema,
  serverCreateInputSchema,
  serverStartInputSchema,
  serverStopInputSchema,
} from "./input-schemas.js";

describe("server input schemas", () => {
  it("accept valid input", () => {
    expect(serverStartInputSchema.parse({})).toEqual({});
    expect(serverStartInputSchema.parse({ port: 4000, host: "::1", transport: "both" })).toEqual({
      port: 4000,
      host: "::1",
      transport: "both",
    });
    expect(serverStopInputSchema.parse({ port: 1, force: true })).toEqual({ port: 1, force: true });
    expect(serverCallInputSchema.parse({ address: "http://127.0.0.1:3000", path: "git.status" })).toEqual({
      address: "http://127.0.0.1:3000",
      path: "git.status",
    });
    expect(
      serverCreateInputSchema.parse({
        transports: [
          { type: "http", port: 3000, host: "127.0.0.1", basePath: "/api" },
          { type: "websocket", port: 3001, host: "127.0.0.1", path: "/ws" },
        ],
        autoRegister: true,
        token: "secret",
      })
    ).toEqual({
      transports: [
        { type: "http", port: 3000, host: "127.0.0.1", basePath: "/api" },
        { type: "websocket", port: 3001, host: "127.0.0.1", path: "/ws" },
      ],
      autoRegister: true,
      token: "secret",
    });
  });

  it("reject an invalid port, transport or call target", () => {
    expect(() => serverStartInputSchema.parse({ port: 70000 })).toThrow();
    expect(() => serverStartInputSchema.parse({ port: "abc" })).toThrow();
    expect(() => serverStartInputSchema.parse({ transport: "udp" })).toThrow();
    expect(() => serverStopInputSchema.parse({ port: 1.5 })).toThrow();
    expect(() => serverCallInputSchema.parse({ path: "git.status" })).toThrow("Give connectionId or address");
    expect(() => serverCreateInputSchema.parse({ transports: [{ type: "ftp" }] })).toThrow();
  });
});
