import { describe, it, expect } from "vitest";
import { serverEndpoint } from "./server-mode.js";

describe("serverEndpoint (audit pass 2)", () => {
  it("puts an IPv6 host in brackets, so the endpoint is a URL", () => {
    expect(serverEndpoint("::1", 3000)).toBe("http://[::1]:3000/api");
    expect(serverEndpoint("::1", 3000, "websocket")).toBe("ws://[::1]:3000/ws");
    expect(new URL(serverEndpoint("::1", 3000)).port).toBe("3000");
  });

  it("gives localhost for a host of all interfaces, and keeps the other hosts", () => {
    expect(serverEndpoint("0.0.0.0", 3000)).toBe("http://localhost:3000/api");
    expect(serverEndpoint("::", 3000)).toBe("http://localhost:3000/api");
    expect(serverEndpoint("127.0.0.1", 4000, "http")).toBe("http://127.0.0.1:4000/api");
  });
});
