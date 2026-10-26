/**
 * startServerMode builds the transports, the lockfile and the host of the server, and reports the
 * start or the failure. The registry, the host options, the runner and the output are fakes.
 */

import { beforeEach, describe, it, expect, vi } from "vitest";

interface Lockfile {
  endpoint: string;
  token: string;
  fsRoot?: string;
}

interface Config {
  lockfile: Lockfile;
  log: (line: string) => void;
  probes?: unknown;
  run?: unknown;
}

interface HostOptions {
  transports: Array<{ type: string; port: number; host: string; basePath?: string }>;
  token: string;
  events: string[];
}

const fake = vi.hoisted(() => ({
  config: undefined as undefined | Config,
  hostOptions: undefined as undefined | HostOptions,
  state: "running",
  fsRoot: undefined as string | undefined,
  lines: [] as string[],
}));

vi.mock("./print.js", () => {
  const add = (msg: string): void => {
    fake.lines.push(msg);
  };
  return { print: { info: add, success: add, error: add, warning: add } };
});

vi.mock("./lockfile.js", () => ({
  currentBuild: () => "build-1",
  getLockfilePath: () => "/servers",
}));

vi.mock("./ecosystem.js", () => ({
  loadEcosystemRegistry: async () => ({
    registry: {},
    fsRoot: fake.fsRoot,
    refusedUnderRoot: fake.fsRoot === undefined ? undefined : ["shell.run"],
  }),
}));

vi.mock("./command.js", () => ({
  markHostOptions: async (options: HostOptions) => {
    fake.hostOptions = options;
    return { fake: true };
  },
}));

vi.mock("@procedures/server", () => ({
  runProcedureHost: async (config: Config) => {
    fake.config = config;
    config.log("host log");
    return {
      life: { state: fake.state, errors: ["port in use"], done: Promise.resolve() },
      host: {
        id: "peer-1",
        server: { procedureCount: 7 },
        info: { endpoints: () => [{ type: "http", address: "http://127.0.0.1:3000/api" }] },
      },
      probes: () => ["http://127.0.0.1:9000/_probes"],
    };
  },
}));

import { startServerMode } from "./server-mode.js";

beforeEach(() => {
  fake.config = undefined;
  fake.hostOptions = undefined;
  fake.state = "running";
  fake.fsRoot = undefined;
  fake.lines = [];
});

const text = (): string => fake.lines.join("\n");

describe("startServerMode", () => {
  it("serves HTTP on the loopback address by default, with a token in the lockfile", async () => {
    await startServerMode({ port: 3000 });
    const transports = fake.hostOptions?.transports ?? [];
    expect(transports).toEqual([{ type: "http", port: 3000, host: "127.0.0.1", basePath: "/api" }]);
    const lockfile = fake.config?.lockfile;
    expect(lockfile?.endpoint).toBe("http://127.0.0.1:3000/api");
    expect(lockfile?.token).toBe(fake.hostOptions?.token);
    expect(lockfile).not.toHaveProperty("fsRoot");
    expect(fake.config).not.toHaveProperty("probes");
    expect(text()).toContain("Procedures: 7");
    expect(text()).toContain("Event topics: none");
    expect(text()).not.toContain("other computers");
  });

  it("serves both transports on two ports, and gives the events, the root and the probes", async () => {
    fake.fsRoot = "/work";
    const run = { exit: () => undefined };
    await startServerMode(
      { port: 4000, host: "0.0.0.0", transport: "both", verbose: true, events: ["job.*"], fsRoot: "/work", probePort: 9000 },
      run as never,
    );
    const transports = fake.hostOptions?.transports ?? [];
    expect(transports.map((each) => [each.type, each.port])).toEqual([
      ["http", 4000],
      ["websocket", 4001],
    ]);
    expect(fake.hostOptions?.events).toEqual(["job.*"]);
    expect(fake.config?.lockfile.fsRoot).toBe("/work");
    expect(fake.config?.probes).toEqual({ port: 9000, host: "0.0.0.0" });
    expect(fake.config?.run).toBe(run);
    expect(text()).toContain("other computers can reach it");
    expect(text()).toContain("Event topics (events.subscribe): job.*");
    expect(text()).toContain("Refused under the root: 1");
    expect(text()).toContain("[probes]");
  });

  it("warns that a WebSocket-only server takes no mark commands", async () => {
    await startServerMode({ port: 3000, transport: "websocket" });
    const transports = fake.hostOptions?.transports ?? [];
    expect(transports.map((each) => [each.type, each.port])).toEqual([["websocket", 3000]]);
    expect(fake.config?.lockfile.endpoint).toBe("ws://127.0.0.1:3000/ws");
    expect(text()).toContain("A WebSocket-only server takes no `mark` commands");
  });

  it("reports the errors when the server does not start", async () => {
    fake.state = "failed";
    await startServerMode({ port: 3000 });
    expect(text()).toContain("The server did not start:");
    expect(text()).toContain("  port in use");
    expect(text()).not.toContain("CLI Server running!");
  });
});
