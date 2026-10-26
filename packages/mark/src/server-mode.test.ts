import { describe, it, expect } from "vitest";
import { extractHost, extractPort, parsePort, parseTransport, SERVER_TRANSPORTS, serverEndpoint } from "./server-mode.js";

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

describe("the server options of argv", () => {
  it("reads a port from --port 4000 and from --port=4000, and gives null without one", () => {
    expect(extractPort(["--port", "4000"])).toBe(4000);
    expect(extractPort(["--port=4001"])).toBe(4001);
    expect(extractPort(["server", "start"])).toBeNull();
  });

  it("refuses a --port without a value, and a port that is not from 1 to 65535", () => {
    expect(() => extractPort(["--port"])).toThrow("--port needs a value");
    expect(() => parsePort("0")).toThrow(/Invalid port/);
    expect(() => parsePort("70000")).toThrow(/Invalid port/);
    expect(() => parsePort("80a")).toThrow(/Invalid port/);
    expect(parsePort("65535")).toBe(65535);
  });

  it("reads a host from --host x and from --host=x, and gives null without one", () => {
    expect(extractHost(["--host", "0.0.0.0"])).toBe("0.0.0.0");
    expect(extractHost(["--host=::1"])).toBe("::1");
    expect(extractHost(["--host"])).toBeNull();
    expect(extractHost([])).toBeNull();
  });

  it("accepts only the known transports", () => {
    for (const transport of SERVER_TRANSPORTS) expect(parseTransport(transport)).toBe(transport);
    expect(() => parseTransport("udp")).toThrow(/Invalid transport: "udp"/);
  });
});
