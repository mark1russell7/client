/**
 * The server.* procedures validate their input (before, the schemas passed anything through).
 * The schemas of server.start, server.stop and server.status are in @procedures/server, with
 * their tests.
 */

import { describe, it, expect } from "vitest";
import {
  serverCallInputSchema,
  serverCreateInputSchema,
} from "./input-schemas.js";

describe("server input schemas", () => {
  it("accept valid input", () => {
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

  it("reject an invalid transport or call target", () => {
    expect(() => serverCallInputSchema.parse({ path: "git.status" })).toThrow("Give connectionId or address");
    expect(() => serverCreateInputSchema.parse({ transports: [{ type: "ftp" }] })).toThrow();
  });
});
