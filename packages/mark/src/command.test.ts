/**
 * Each command of `mark` runs under `run()` of `@mark1russell7/service` (CLI-26, decision D17). The
 * tests give the fake process port of the service: no real signal, and no end of the test process.
 *
 * - The cold mode: the runner ends the command with its exit code, 0 or 1.
 * - A signal stops a cold stream through the drain: the procedure gets the abort.
 * - The warm mode: the signal goes with the HTTP call, and the CLI server aborts the procedure.
 * - The cold host and the CLI server serve the same procedures, with the same policy.
 * - A program that calls `executeArgs()` without a port keeps its process.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { z } from "zod";
import { fakeProcess } from "@mark1russell7/service/testing";
import { Client, LocalTransport, ProcedureRegistry, createProcedure, type AnyProcedure } from "@procedures/client";
import { createProcedureHost, localFace } from "@procedures/peer";
import { runProcedureHost, type RunningHost } from "@procedures/server";
import { executeArgs, type CliContext } from "./cli.js";
import { cliServerConnection } from "./client-mode.js";
import { COMMAND_PROFILE, commandRunOptions, markHostOptions, startColdCommand, startWarmCommand } from "./command.js";
import { loadEcosystemRegistry } from "./ecosystem.js";
import { testProcedures } from "../test/procedures.js";

/** A promise and the function that resolves it. */
function newMark(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((given) => {
    resolve = given;
  });
  return { promise, resolve };
}

/** The state of the endless stream: its first row went out, and its call got the abort. */
let firstRow = newMark();
let abortSeen = newMark();
/** The release of the endless stream without its abort: the stop of a test that exits before the drain. */
let release = newMark();

/** A stream that gives one row, and then waits until the abort of its call, or the release of the test. */
function endlessProcedure(): AnyProcedure {
  return createProcedure()
    .path(["test", "endless"])
    .input(z.object({}))
    .output(z.string())
    .meta({ effects: { reads: [], writes: [] } })
    .handler(async function* (_input: unknown, ctx: { signal?: AbortSignal | undefined }) {
      yield "row 1";
      firstRow.resolve();
      const abort = new Promise<void>((resolve) => {
        if (!ctx.signal || ctx.signal.aborted) return resolve();
        ctx.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      await Promise.race([abort, release.promise]);
      if (ctx.signal?.aborted) abortSeen.resolve();
    } as never)
    .build() as unknown as AnyProcedure;
}

function registryOf(procedures: readonly AnyProcedure[]): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  for (const procedure of procedures) registry.register(procedure);
  return registry;
}

/** The context of the tests: the test procedures and the endless stream. */
function context(): CliContext {
  const procedures = [...testProcedures(), endlessProcedure()];
  const registry = registryOf(procedures);
  return { client: new Client({ transport: new LocalTransport({ registry }) }), procedures, registry, verbose: false };
}

/** The printed lines of a test. */
function capture(): () => string {
  const lines: string[] = [];
  const keep = (...args: unknown[]): void => {
    lines.push(args.map(String).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(keep);
  vi.spyOn(console, "error").mockImplementation(keep);
  vi.spyOn(console, "warn").mockImplementation(keep);
  return () => lines.join("\n");
}

const hosts: RunningHost[] = [];
afterEach(async () => {
  process.exitCode = 0;
  vi.restoreAllMocks();
  for (const running of hosts.splice(0)) {
    await running.life.shutdown("the test ended");
    await running.life.done;
  }
  release.resolve();
  firstRow = newMark();
  abortSeen = newMark();
  release = newMark();
});

describe("the cold mode (CLI-26)", () => {
  it("ends a command through the runner, with the exit code 0 or 1", async () => {
    capture();
    for (const [argv, code] of [
      [["result", "ok"], 0],
      [["result", "throws"], 1],
      [["result", "fails"], 1],
      [["result", "exit"], 1],
    ] as const) {
      process.exitCode = 0;
      const proc = fakeProcess();
      await executeArgs([...argv, "--local"], context(), { run: { process: proc } });
      expect(proc.exits, argv.join(" ")).toEqual([code]);
      expect(Number(process.exitCode ?? 0), argv.join(" ")).toBe(code);
      // The runner adds its handlers at the start, and removes them at the exit
      expect(proc.handlers, argv.join(" ")).toBe(0);
    }
  });

  it("starts no service for the help and for a problem of the command line", async () => {
    capture();
    const proc = fakeProcess();
    await executeArgs(["result", "ok", "--help", "--local"], context(), { run: { process: proc } });
    await executeArgs(["result", "nosuch", "--local"], context(), { run: { process: proc } });
    expect(proc.exits).toEqual([]);
    expect(proc.triggers).toEqual([]);
  });

  it("stops a stream at a first Ctrl-C through the drain: the procedure gets the abort", async () => {
    const output = capture();
    const proc = fakeProcess();
    const command = executeArgs(["test", "endless", "--local"], context(), { run: { process: proc } });
    await firstRow.promise;
    expect(proc.triggers).toContain("SIGINT");
    proc.signal("SIGINT");
    await command;
    await abortSeen.promise;
    expect(output()).toContain("row 1");
    expect(output()).toContain("Request was aborted");
    // The exit code of a first Ctrl-C: 130, the code of the profile ephemeral (before CLI-26: 1)
    expect(proc.exits).toEqual([130]);
    expect(Number(process.exitCode ?? 0)).toBe(130);
  });

  it("runs the --json reference under the runner", async () => {
    const output = capture();
    const proc = fakeProcess();
    await executeArgs(["--json", JSON.stringify({ $proc: ["result", "ok"], input: {} }), "--local"], context(), { run: { process: proc } });
    expect(output()).toContain('"success": true');
    expect(proc.exits).toEqual([0]);
    const failed = fakeProcess();
    await executeArgs(["--json", JSON.stringify({ $proc: ["result", "throws"], input: {} })], context(), { run: { process: failed } });
    expect(failed.exits).toEqual([1]);
    expect(output()).toContain("handler error");
  });

  it("keeps the process of a program that gives no port: no handler, and the exit code in process.exitCode", async () => {
    capture();
    const before = process.listenerCount("SIGINT");
    await executeArgs(["result", "throws", "--local"], context());
    expect(Number(process.exitCode ?? 0)).toBe(1);
    expect(process.listenerCount("SIGINT")).toBe(before);
  });
});

describe("the profiles and the ports of a command", () => {
  it("is the profile ephemeral for each command: 130 after SIGINT, an abort at the start of the drain, and an exit at a repeat signal", async () => {
    const { ephemeral } = await import("@mark1russell7/service");
    expect(COMMAND_PROFILE).toBe(ephemeral);
    expect(COMMAND_PROFILE.exitCodes).toEqual({ SIGINT: 130, SIGTERM: 143, SIGQUIT: 131 });
    expect(COMMAND_PROFILE.onRepeatSignal).toBe("exit");
    expect(COMMAND_PROFILE.cooperativeFloor).toBe("none");
  });

  it("ends the process with 1 at a second signal during the stop", async () => {
    capture();
    const proc = fakeProcess();
    const command = executeArgs(["test", "endless", "--local"], context(), { run: { process: proc } });
    await firstRow.promise;
    // The second signal comes while the stop runs: the runner exits at once with 1, also before the drain
    proc.signal("SIGINT");
    proc.signal("SIGINT");
    expect(proc.exits).toEqual([1]);
    // A fake process does not end: the release of the test ends the stream, and then the command
    release.resolve();
    await command;
    expect(proc.exits).toEqual([1]);
    expect(Number(process.exitCode ?? 0)).toBe(1);
  });

  it("gives the process of Node only to a run that owns its process", async () => {
    const { nodeProcess } = await import("@mark1russell7/service");
    expect(commandRunOptions({ ownsProcess: true }).process).toBe(nodeProcess);
    expect(commandRunOptions({}).process).not.toBe(nodeProcess);
    const proc = fakeProcess();
    expect(commandRunOptions({ ownsProcess: true, run: { process: proc } }).process).toBe(proc);
  });
});

describe("the warm mode (CLI-26)", () => {
  it("gives the signal to the call on the CLI server: a Ctrl-C aborts the procedure on the server", async () => {
    capture();
    const token = "a-test-token";
    const registry = registryOf([endlessProcedure()]);
    const options = await markHostOptions({ id: "warm-test", registry, transports: [{ type: "http", port: 0, host: "127.0.0.1", basePath: "/api" }], token });
    const server = await runProcedureHost({ name: "mark-server-test", mode: "background", host: options, run: { process: fakeProcess() } });
    hosts.push(server);
    const endpoint = server.host.info.endpoints().find((each) => each.type === "http")!.address;

    const connection = await cliServerConnection({ endpoint, token }, ["test", "endless"]);
    expect(connection).not.toBeNull();
    const proc = fakeProcess();
    const command = await startWarmCommand({ run: { process: proc } });
    const items: unknown[] = [];
    // The first row reached this side: the server sent it, and the call is in flight
    const received = newMark();
    let result: Awaited<ReturnType<NonNullable<typeof connection>["call"]>> | undefined;
    const request = command.request(async (signal) => {
      result = await connection!.call(
        {},
        (item) => {
          items.push(item);
          received.resolve();
        },
        signal,
      );
    });
    await received.promise;
    proc.signal("SIGINT");
    const end = await request;
    await abortSeen.promise;
    expect(items).toEqual(["row 1"]);
    expect(result?.success).toBe(false);
    // The work of the command ends after the abort: the runner records its end
    expect(["done", "cut"]).toContain(end.kind);
    // The exit code of a warm command after a first Ctrl-C: 130 (before CLI-26, the signal ended the process)
    expect(await command.end(1)).toBe(130);
    expect(proc.exits).toEqual([130]);
  });
});

describe("the cold host and the CLI server (CLI-26)", () => {
  it("serve the same procedures, with the same policy", async () => {
    const { registry } = await loadEcosystemRegistry(false, false);
    const warm = createProcedureHost(
      await markHostOptions({ id: "warm", registry, transports: [{ type: "http", port: 0, host: "127.0.0.1", basePath: "/api" }], token: "t", events: ["orders.*"] }),
    );
    const proc = fakeProcess();
    const cold = await startColdCommand(registry, { run: { process: proc } });
    if ("errors" in cold) throw new Error(cold.errors.join("; "));
    try {
      expect(cold.host.registry).toBe(registry);
      expect(cold.host.server.procedureCount).toBe(warm.server.procedureCount);
      const paths = registry.getAll().map((procedure) => procedure.path);
      expect(paths.length).toBeGreaterThan(100);
      for (const path of [...paths, ["host", "health"], ["host", "info"], ["events", "subscribe"]]) {
        expect(cold.host.server.hasProcedure(path), path.join(".")).toBe(warm.server.hasProcedure(path));
      }
      // The same policy, without the token: each call of the local face is a call of this process
      const { token: warmToken, events: warmEvents, ...warmPolicy } = warm.policy;
      const { token: coldToken, events: coldEvents, ...coldPolicy } = cold.host.policy;
      expect(warmToken).toBe("t");
      expect(coldToken).toBeUndefined();
      expect(coldPolicy).toEqual(warmPolicy);
      expect(coldEvents).toEqual({ topics: [] });
      expect(warmEvents).toEqual({ topics: ["orders.*"] });
      // The cold host has no listener: only the local face, and the endpoint local://in-process
      expect(cold.host.info.endpoints()).toEqual([{ type: "local", address: "local://in-process" }]);
      expect(await cold.client.call({ service: "client", operation: "identity" }, { value: 7 })).toEqual(7);
    } finally {
      expect(await cold.command.end(0)).toBe(0);
      expect(proc.exits).toEqual([0]);
    }
    // The face of a host that a test makes alone: nothing runs, and nothing listens
    expect(localFace().transport.name).toBe("local-face");
  }, 120000);
});
