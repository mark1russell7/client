/**
 * The hosts stop under `run()` of `@mark1russell7/service`: SIGTERM in the middle of an NDJSON
 * stream (roadmap CI-2, CLI-8).
 *
 * Each case starts a built host as a process: `procedure-server` (the profile `localDev`) and
 * `mark --server` (the background host, the profile `daemon`). It starts NDJSON streams without an
 * end, opens one more connection and starts a call that ends within the grace. Then it sends
 * SIGTERM, and examines the stop in stages:
 *
 * - (a) Each stream without an end ends in band at the cooperative abort of the drain: its last
 *   line is an error line, and its connection does not reset.
 * - (b) The stage "stop intake" closes the listener: a new connection is refused, and a new request
 *   on an open connection gets 503 with `Retry-After`.
 * - (c) The process exits with the code 0.
 * - (d) The time from SIGTERM to the exit is less than the sum of the caps of the stages and a
 *   margin. The drain waits for the call in flight that ends within the grace.
 *
 * The test measures times. Thus only the CI job `lifecycle` starts it (`vitest.e2e.config.ts`),
 * on Linux: Windows has no SIGTERM. It needs the build of `@procedures/server` and `@procedures/mark`.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appendFileSync, closeSync, constants, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { cooperativeAbortAt, type Profile } from "@mark1russell7/service";
import { HOST_PROFILES } from "../src/host.js";

/** The bin of `procedure-server`. */
const SERVER_BIN = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
/** The bin of `mark`, from the workspace. `@procedures/mark` depends on this package, not the reverse. */
const MARK_BIN = fileURLToPath(new URL("../../mark/dist/bin.js", import.meta.url));
/** The procedures `lifecycle.ticks`, `lifecycle.ticksOnce` and `lifecycle.count`, for `--procedures`. */
const FIXTURE = new URL("./fixture-lifecycle.mjs", import.meta.url).href;

/** The margin over the sum of the caps of the stages: the signal, the exit of Node and a slow runner. */
const MARGIN_MS = 5_000;
/** A timer of Node can fire 1 ms early, and the two processes round their times. */
const TIMER_SLACK_MS = 50;
/** The items of `lifecycle.count`, one each 100 ms. */
const COUNT_ITEMS = 8;

// ---------------------------------------------------------------------------
// The processes
// ---------------------------------------------------------------------------

/** The exit of a process, and the time of `performance.now()` at the exit. */
interface Exit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly at: number;
}

/** A host process: its output and its exit. */
interface HostProcess {
  readonly child: ChildProcessWithoutNullStreams;
  output(): string;
  /** This function waits until the output (stdout and stderr) has the text. */
  waitFor(text: string, ms: number): Promise<void>;
  readonly exited: Promise<Exit>;
}

const children: ChildProcessWithoutNullStreams[] = [];
const folders: string[] = [];
const descriptors: number[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  // The write end of a pipe that a failed test did not close
  for (const fd of descriptors.splice(0)) closeSync(fd);
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true, maxRetries: 3 });
});

/** This function starts `node` with the arguments: a host. */
function startHost(args: readonly string[], options: { readonly cwd?: string; readonly env?: Readonly<Record<string, string>> } = {}): HostProcess {
  const child = spawn(process.execPath, [...args], {
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", ...options.env },
  });
  children.push(child);
  let output = "";
  let exit: Exit | undefined;
  const watchers = new Set<() => void>();
  const changed = (): void => {
    for (const watcher of [...watchers]) watcher();
  };
  const onData = (data: Buffer): void => {
    output += data.toString();
    changed();
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  const exited = new Promise<Exit>((resolve) => {
    child.once("exit", (code, signal) => {
      exit = { code, signal, at: performance.now() };
      resolve(exit);
      changed();
    });
  });
  const waitFor = (text: string, ms: number): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const stop = (): void => {
        clearTimeout(timer);
        watchers.delete(check);
      };
      const check = (): void => {
        if (output.includes(text)) {
          stop();
          resolve();
        } else if (exit !== undefined) {
          stop();
          reject(new Error(`The host exited (code ${exit.code}, signal ${exit.signal}) before "${text}":\n${output}`));
        }
      };
      const timer = setTimeout(() => {
        stop();
        reject(new Error(`No "${text}" within ${ms} ms:\n${output}`));
      }, ms);
      watchers.add(check);
      check();
    });
  return { child, output: () => output, waitFor, exited };
}

/** A free port of the loopback interface. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** This function gives the value of the promise, or fails after `ms`. */
async function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${what}: no end within ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** This function waits until `ready` gives true: it asks again each 20 ms, until `ms`. */
async function until(ready: () => boolean, ms: number, what: string): Promise<void> {
  const end = performance.now() + ms;
  while (!ready()) {
    if (performance.now() > end) throw new Error(`${what}: not within ${ms} ms`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// ---------------------------------------------------------------------------
// The calls
// ---------------------------------------------------------------------------

/** A line of an NDJSON stream of wire v1 (`documentation/WIRE-PROTOCOL.md`). */
interface Line {
  readonly type: string;
  readonly seq?: number;
  readonly payload?: unknown;
  readonly error?: { readonly code?: string; readonly message?: string; readonly retryable?: boolean };
}

/** The end of the body of a stream: its time, and the error of the read when the connection reset. */
interface StreamEnd {
  readonly at: number;
  readonly reset: unknown;
}

/** A stream call in flight: its lines so far, and the end of its body. */
interface StreamCall {
  readonly lines: Line[];
  /** This function waits until the stream has given `count` items. */
  items(count: number): Promise<void>;
  readonly ended: Promise<StreamEnd>;
}

/** The headers of a call of a host with a token. */
function headersOf(token: string): Record<string, string> {
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}

/** This function starts a call with `Accept: application/x-ndjson`, and reads its lines as they come. */
async function streamCall(url: string, token: string, input: unknown): Promise<StreamCall> {
  const response = await fetch(url, { method: "POST", headers: { ...headersOf(token), accept: "application/x-ndjson" }, body: JSON.stringify(input) });
  if (response.status !== 200 || response.body === null) {
    throw new Error(`POST ${url} gave ${response.status}: ${await response.text()}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const lines: Line[] = [];
  const watchers = new Set<() => void>();
  let done = false;
  const changed = (): void => {
    for (const watcher of [...watchers]) watcher();
  };
  const ended = (async (): Promise<StreamEnd> => {
    let buffer = "";
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) return { at: performance.now(), reset: undefined };
        buffer += decoder.decode(chunk.value, { stream: true });
        for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
          const text = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 1);
          // A blank line is a keep-alive line
          if (text !== "") lines.push(JSON.parse(text) as Line);
        }
        changed();
      }
    } catch (error) {
      return { at: performance.now(), reset: error };
    } finally {
      done = true;
      changed();
    }
  })();
  const itemCount = (): number => lines.filter((line) => line.type === "item").length;
  const items = (count: number): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const check = (): void => {
        if (itemCount() >= count) {
          watchers.delete(check);
          resolve();
        } else if (done) {
          watchers.delete(check);
          reject(new Error(`${url}: the stream ended after ${itemCount()} items: ${JSON.stringify(lines)}`));
        }
      };
      watchers.add(check);
      check();
    });
  return { lines, items, ended };
}

/** The payloads of the items of a stream. */
function payloadsOf(call: StreamCall): unknown[] {
  return call.lines.filter((line) => line.type === "item").map((line) => line.payload);
}

/** A raw HTTP response: the status, the headers in lower case and the body. */
interface RawResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** This function reads a raw HTTP/1.1 response. */
function parseResponse(raw: string): RawResponse {
  const split = raw.indexOf("\r\n\r\n");
  const head = split >= 0 ? raw.slice(0, split) : raw;
  const [statusLine = "", ...fields] = head.split("\r\n");
  const headers: Record<string, string> = {};
  for (const field of fields) {
    const colon = field.indexOf(":");
    if (colon > 0) headers[field.slice(0, colon).trim().toLowerCase()] = field.slice(colon + 1).trim();
  }
  return { status: Number(statusLine.split(" ")[1]), headers, body: split >= 0 ? raw.slice(split + 4) : "" };
}

/**
 * This function opens a connection and sends the start of a request: its request line and one
 * header, without the end of the headers. The server then has a message in progress on the
 * connection, so the connection is not idle. The stop of the intake closes only the idle
 * connections (an idle keep-alive connection closes at once, so it cannot carry a request into the
 * drain). `finish()` sends the rest of the request, and gives the response when the server closes
 * the connection.
 */
async function openRequest(port: number, path: string): Promise<{ finish(token: string): Promise<RawResponse> }> {
  const socket = connect(port, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", reject);
  });
  let received = "";
  let closed = false;
  socket.on("data", (chunk: Buffer) => {
    received += chunk.toString("utf8");
  });
  // A reset also ends in a close: the response, or no response, tells the result
  socket.on("error", () => undefined);
  const close = new Promise<void>((resolve) => {
    socket.once("close", () => {
      closed = true;
      resolve();
    });
  });
  socket.write(`POST ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n`);
  return {
    async finish(token: string): Promise<RawResponse> {
      if (closed) throw new Error(`The server closed the open connection before the end of the request. It sent: ${JSON.stringify(received)}`);
      socket.write(`Authorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}`);
      await close;
      return parseResponse(received);
    },
  };
}

/** This function gives the result of a new connection to the port: "connected", or the code of its error. */
function connectOutcome(port: number): Promise<string> {
  return new Promise<string>((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve("connected");
    });
    socket.once("error", (error: Error) => resolve((error as NodeJS.ErrnoException).code ?? error.message));
  });
}

// ---------------------------------------------------------------------------
// The stop
// ---------------------------------------------------------------------------

/** A time of a profile in milliseconds. The profiles give their times in s or ms. */
function msOf(amount: { readonly value: number; readonly unit: string }): number {
  if (amount.unit === "ms") return amount.value;
  if (amount.unit === "s") return amount.value * 1000;
  throw new Error(`A time in the unit ${amount.unit}: the test reads only ms and s`);
}

/** The times of the stop of a profile: the sum of the caps of its stages, and the cooperative abort after the start of the drain. */
function stopTimes(profile: Profile): { readonly capsMs: number; readonly cooperativeAbortMs: number } {
  const phases = profile.phases ?? [];
  const capsMs = phases.reduce((sum, phase) => sum + msOf(phase.cap), 0);
  const drain = phases.find((phase) => phase.name === "drain");
  if (drain === undefined || profile.cooperativeWindow === undefined) throw new Error("The profile has no stage drain or no cooperative window");
  return { capsMs, cooperativeAbortMs: cooperativeAbortAt(msOf(drain.cap), profile.cooperativeWindow, profile.cooperativeFloor) };
}

/** A stream without an end, and the codes that its in-band end can have. */
interface EndlessStream {
  readonly name: string;
  readonly call: StreamCall;
  readonly codes: readonly string[];
}

/** A call in flight at SIGTERM, which ends within the grace of the drain. */
interface GraceCall {
  /** The test calls this function in the drain, after the stop of the intake. Then the call can end. */
  release(): void;
  /** The end of the call: the time of `performance.now()`. */
  readonly ended: Promise<number>;
}

/** A host that answers, and the calls of the case. */
interface Scenario {
  readonly name: string;
  readonly host: HostProcess;
  readonly port: number;
  readonly token: string;
  readonly profile: Profile;
  /** This function starts the streams without an end, and gives them after the first item of each. */
  startEndless(): Promise<EndlessStream[]>;
  /** This function starts a call that ends within the grace, and gives it when it is in flight. */
  startGraceCall(): Promise<GraceCall>;
}

/** What the test saw after SIGTERM. Each time is a time of `performance.now()`. */
interface Outcome {
  readonly sigtermAt: number;
  readonly endless: ReadonlyArray<EndlessStream & { readonly end: StreamEnd }>;
  readonly graceEndedAt: number;
  /** The response to the request that the open connection sent in the drain. */
  readonly refusal: RawResponse;
  /** The result of a new connection in the drain. */
  readonly newConnection: string;
  readonly exit: Exit;
}

/**
 * This function starts the calls, opens a connection with a request in progress and sends
 * SIGTERM. Then it collects the end of each call, the answers in the drain and the exit.
 */
async function sigtermInAStream(scenario: Scenario): Promise<Outcome> {
  const { host, port, token } = scenario;
  const endless = await scenario.startEndless();
  // Before the call of the grace: the server reads this start of a request before that call is in flight
  const open = await openRequest(port, "/api/host/info");
  const grace = await scenario.startGraceCall();

  const sigtermAt = performance.now();
  host.child.kill("SIGTERM");
  // The runner prints this line in the stage "stop intake", after each transport stopped its
  // intake. Thus the listener is closed now, and the drain runs.
  await host.waitFor("Shutting down", 10_000);
  const refusal = await within(open.finish(token), 10_000, "the request on the open connection");
  const newConnection = await connectOutcome(port);
  // The call in flight can end now: the drain waits for it
  grace.release();
  const limit = stopTimes(scenario.profile).capsMs + MARGIN_MS + 10_000;
  const [ends, graceEndedAt, exit] = await within(
    Promise.all([Promise.all(endless.map((stream) => stream.call.ended)), grace.ended, host.exited]),
    limit,
    `${scenario.name} after SIGTERM`,
  );
  return { sigtermAt, endless: endless.map((stream, index) => ({ ...stream, end: ends[index]! })), graceEndedAt, refusal, newConnection, exit };
}

/** This function prints a line of the result, and adds it to the summary of the job on GitHub. */
function report(line: string): void {
  console.log(`[lifecycle] ${line}`);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary) appendFileSync(summary, `- ${line}\n`);
}

/** This function examines the stop: (a) to (d) of the description of this file. */
function examine(scenario: Scenario, outcome: Outcome): void {
  const { capsMs, cooperativeAbortMs } = stopTimes(scenario.profile);
  const since = (at: number): number => Math.round(at - outcome.sigtermAt);
  const toExit = outcome.exit.at - outcome.sigtermAt;
  const ends = outcome.endless.map((stream) => {
    const last = stream.call.lines.at(-1);
    return `${stream.name} ${last?.error?.code} (retryable ${last?.error?.retryable}) at ${since(stream.end.at)} ms`;
  });
  report(
    `${scenario.name}: in-band ends ${ends.join(", ")}. The cooperative abort comes ${cooperativeAbortMs} ms after the start of the drain. ` +
      `The call of the grace ended at ${since(outcome.graceEndedAt)} ms. SIGTERM to the exit ${Math.round(toExit)} ms (the caps sum to ${capsMs} ms), ` +
      `exit code ${outcome.exit.code}. Request in the drain ${outcome.refusal.status} (Retry-After ${outcome.refusal.headers["retry-after"]}), ` +
      `new connection ${outcome.newConnection}.`,
  );

  // The caps of the stages sum to 10 s: they replace the hard-exit timer of 10 s of the entries
  expect(capsMs).toBeLessThanOrEqual(10_000);

  // (a) Each stream without an end ends in band: each line before the last is an item in
  // sequence, and the last is an error line. A reset of the connection fails the read of the body.
  for (const stream of outcome.endless) {
    expect(stream.end.reset, `the connection of ${stream.name} reset before its in-band end`).toBeUndefined();
    const last = stream.call.lines.at(-1);
    expect(last?.type, `the last line of ${stream.name}`).toBe("error");
    expect(stream.codes, `the code of the in-band end of ${stream.name}`).toContain(last?.error?.code);
    // A retryable end is UNAVAILABLE, and an end that is not retryable is INTERNAL_ERROR
    expect(last?.error?.retryable).toBe(last?.error?.code === "UNAVAILABLE");
    const before = stream.call.lines.slice(0, -1);
    expect(before.length).toBeGreaterThan(0);
    before.forEach((line, index) => expect(line).toMatchObject({ type: "item", seq: index + 1 }));
    // The drain waits for the stream until the cooperative abort: the end does not come sooner
    expect(stream.end.at - outcome.sigtermAt, `the end of ${stream.name} after SIGTERM`).toBeGreaterThanOrEqual(cooperativeAbortMs - TIMER_SLACK_MS);
  }

  // (b) The listener closed at the stop of the intake: a new connection is refused. The open
  // connection takes the request, and `httpTransport` refuses it with a retryable 503. No mount
  // of the hosts stays until "close transports", so no handler sees the request.
  expect(outcome.newConnection).toBe("ECONNREFUSED");
  expect(outcome.refusal.status).toBe(503);
  expect(outcome.refusal.headers["retry-after"]).toMatch(/^[1-9]\d*$/);
  expect(outcome.refusal.headers["connection"]).toBe("close");

  // (c) The profiles localDev and daemon give no exit code for a signal. Only the profile
  // `ephemeral` gives one (143 for SIGTERM). Thus the runner exits with 0 after a stop without an
  // error, and with 1 when a stage fails or reaches its cap. The code 0 also tells that each stage
  // ended within its cap.
  expect(outcome.exit).toMatchObject({ code: 0, signal: null });

  // (d) The stop ends before the sum of the caps of the stages, with a margin for the process.
  // The call of the grace ended before the exit: the drain waited for it.
  expect(toExit).toBeLessThan(capsMs + MARGIN_MS);
  expect(outcome.graceEndedAt).toBeLessThan(outcome.exit.at);
}

// ---------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------

describe.skipIf(process.platform === "win32")("the hosts stop under run(): SIGTERM in the middle of a stream (CI-2)", () => {
  beforeAll(() => {
    for (const bin of [SERVER_BIN, MARK_BIN]) {
      if (!existsSync(bin)) throw new Error(`The lifecycle test needs the build (${bin}). Start \`pnpm build\` first.`);
    }
  });

  it("procedure-server (the profile localDev)", async () => {
    const port = await freePort();
    const token = "lifecycle-token";
    const base = `http://127.0.0.1:${port}/api`;
    const host = startHost([SERVER_BIN, "--port", String(port), "--token", token, "--transport", "http", "--procedures", FIXTURE]);
    let count: StreamCall | undefined;
    try {
      await host.waitFor("Press Ctrl+C", 60_000);
      const scenario: Scenario = {
        name: "procedure-server",
        host,
        port,
        token,
        profile: HOST_PROFILES.foreground,
        startEndless: async () => {
          const [ticks, ticksOnce] = await Promise.all([streamCall(`${base}/lifecycle/ticks`, token, {}), streamCall(`${base}/lifecycle/ticksOnce`, token, {})]);
          await Promise.all([ticks.items(1), ticksOnce.items(1)]);
          return [
            // lifecycle.ticks writes nothing: a cut of it is retryable
            { name: "lifecycle.ticks", call: ticks, codes: ["UNAVAILABLE"] },
            // lifecycle.ticksOnce declares a write, so a call of it can have had its effect. Before
            // CLI-48, the in-band end of such a cut is INTERNAL_ERROR (not retryable): main gave
            // that on 2026-10-19. CLI-48 (release 0.14.0) makes each stream that the shutdown cuts
            // end with UNAVAILABLE. When CLI-48 is on main, keep only UNAVAILABLE here.
            { name: "lifecycle.ticksOnce", call: ticksOnce, codes: ["INTERNAL_ERROR", "UNAVAILABLE"] },
          ];
        },
        // lifecycle.count ends about 700 ms after its first item: within the grace
        startGraceCall: async () => {
          const call = await streamCall(`${base}/lifecycle/count`, token, { count: COUNT_ITEMS, every: 100 });
          await call.items(1);
          count = call;
          return { release: () => undefined, ended: call.ended.then((end) => end.at) };
        },
      };
      const outcome = await sigtermInAStream(scenario);
      examine(scenario, outcome);
      // The drain waited for lifecycle.count: each item, and then its done line
      expect(count?.lines.at(-1)?.type).toBe("done");
      expect(payloadsOf(count!)).toEqual(Array.from({ length: COUNT_ITEMS }, (_, index) => index + 1));
    } finally {
      console.log(`[lifecycle] the output of procedure-server:\n${host.output()}`);
    }
  });

  it("mark --server (the profile daemon): the same stop, and the lockfile goes away", async () => {
    const home = mkdtempSync(join(tmpdir(), "lifecycle-mark-"));
    folders.push(home);
    const watched = join(home, "watched");
    mkdirSync(watched);
    // A named pipe: fs.read of it waits until the test writes and closes the pipe
    const pipe = join(home, "grace.fifo");
    const made = spawnSync("mkfifo", [pipe], { encoding: "utf8" });
    expect(made.status, made.stderr).toBe(0);
    const port = await freePort();
    // mark --server writes its lockfile under the home folder, and takes the commands of its folder
    const host = startHost([MARK_BIN, "--server", "--port", String(port)], { cwd: home, env: { HOME: home, USERPROFILE: home } });
    let read: { status: number; body: unknown } | undefined;
    try {
      await host.waitFor("Press Ctrl+C", 90_000);
      const lockPath = join(home, ".mark", "servers", `${port}.lock`);
      const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { endpoint: string; token: string };
      // The calls start no program. @procedures/shell kills each program that it started at the
      // first SIGTERM, with signal handlers of its own (tree-kill.ts). Thus a shell.stream call
      // ends at the signal, before the drain, and the drain has no call to wait for.
      const scenario: Scenario = {
        name: "mark --server",
        host,
        port,
        token: lock.token,
        profile: HOST_PROFILES.background,
        // fs.watch has no end. It gives an item for each change in the folder, so the test changes
        // a file until the first item comes: the watcher starts after the head of the response.
        startEndless: async () => {
          const watch = await streamCall(`${lock.endpoint}/fs/watch`, lock.token, { path: watched });
          const change = setInterval(() => writeFileSync(join(watched, "change.txt"), String(performance.now())), 50);
          try {
            await watch.items(1);
          } finally {
            clearInterval(change);
          }
          // fs.watch reads files and writes nothing: a cut of it is retryable
          return [{ name: "fs.watch", call: watch, codes: ["UNAVAILABLE"] }];
        },
        // fs.read of the pipe is in flight when the read end of the pipe is open: then an open of
        // the write end without a wait succeeds. The release writes a text and closes the pipe.
        startGraceCall: async () => {
          let settled = false;
          const response = fetch(`${lock.endpoint}/fs/read`, { method: "POST", headers: headersOf(lock.token), body: JSON.stringify({ path: pipe }) });
          const ended = response.then(async (answer) => {
            read = { status: answer.status, body: await answer.json() };
            return performance.now();
          });
          void ended.then(
            () => (settled = true),
            () => (settled = true),
          );
          let fd: number | undefined;
          await until(
            () => {
              if (settled) throw new Error(`fs.read of the pipe ended before the test wrote to it: ${JSON.stringify(read)}`);
              try {
                fd = openSync(pipe, constants.O_WRONLY | constants.O_NONBLOCK);
                descriptors.push(fd);
                return true;
              } catch {
                // ENXIO: the host has not opened the read end yet
                return false;
              }
            },
            10_000,
            "the open of the pipe by fs.read",
          );
          return {
            release: () => {
              descriptors.splice(descriptors.indexOf(fd!), 1);
              writeSync(fd!, "drained");
              closeSync(fd!);
            },
            ended,
          };
        },
      };
      const outcome = await sigtermInAStream(scenario);
      examine(scenario, outcome);
      // The drain waited for fs.read: the host answered it after the release
      expect(read).toMatchObject({ status: 200, body: { content: "drained" } });
      // The stage "tear down dependencies" removed the lockfile
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      console.log(`[lifecycle] the output of mark --server:\n${host.output()}`);
    }
  });
});
