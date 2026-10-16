/**
 * The registry of long-running processes (deep dive WRP-4, WRP-10): a process that a procedure
 * starts and leaves running has a record, a stop and an end when the host ends.
 */

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { ProcessRegistry, type ManagedProcessInfo, type ProcessFollowItem } from "./index.js";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("ProcessRegistry", () => {
  it("lists a running process, stops its tree and keeps the exit", async () => {
    const registry = new ProcessRegistry();
    const script = [
      "const { spawn } = require('node:child_process');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: process.platform === 'win32' });",
      "console.log('grandchild ' + child.pid);",
      "setInterval(() => {}, 1000);",
    ].join("");
    const started = registry.start(process.execPath, { args: ["-e", script], group: "test", label: "sleeper" });
    const ready = await registry.waitFor(started.id, /grandchild (\d+)/, 10_000);
    const grandchild = Number(ready[1]);

    expect(registry.list({ group: "test" })).toEqual([
      expect.objectContaining({ id: started.id, status: "running", label: "sleeper", pid: started.pid }),
    ]);
    expect(registry.list({ group: "other" })).toEqual([]);

    const stopped = await registry.stop(started.id);
    expect(stopped.stopped).toBe(true);
    expect(registry.get(started.id)?.status).toBe("exited");
    const end = Date.now() + 5000;
    while (alive(grandchild) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(alive(grandchild)).toBe(false);
  }, 20_000);

  it("keeps the end of the output of a process", async () => {
    const registry = new ProcessRegistry();
    const started = registry.start(process.execPath, { args: ["-e", "for (let i = 0; i < 5000; i++) console.log('row ' + i)"] });
    await registry.exited(started.id);
    const output = registry.output(started.id);
    expect(output.endsWith("row 4999\n")).toBe(true);
    expect(output.length).toBeLessThanOrEqual(64 * 1024);
    expect(registry.get(started.id)).toMatchObject({ status: "exited", exitCode: 0 });
  }, 20_000);

  it("removes old exit records (reaping)", async () => {
    const registry = new ProcessRegistry({ keepExited: 2 });
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const started = registry.start(process.execPath, { args: ["-e", ""] });
      await registry.exited(started.id);
      ids.push(started.id);
    }
    expect(registry.list().map((info) => info.id)).toEqual(ids.slice(2));
  }, 20_000);

  it("forgets the record of an ended process only", async () => {
    const registry = new ProcessRegistry();
    const running = registry.start(process.execPath, { args: ["-e", "setInterval(() => {}, 1000)"] });
    const ended = registry.start(process.execPath, { args: ["-e", ""] });
    await registry.exited(ended.id);
    expect(registry.forget(running.id)).toBe(false);
    expect(registry.forget(ended.id)).toBe(true);
    expect(registry.list().map((info) => info.id)).toEqual([running.id]);
    await registry.stop(running.id);
  }, 20_000);

  it("matches the pattern against the output without color codes", async () => {
    const registry = new ProcessRegistry();
    const colored = "console.log('  \\u001b[1mLocal\\u001b[22m:   \\u001b[36mhttp://localhost:\\u001b[1m5173\\u001b[22m/\\u001b[39m'); setInterval(() => {}, 1000)";
    const started = registry.start(process.execPath, { args: ["-e", colored] });
    const match = await registry.waitFor(started.id, /Local:\s+(http:\/\/\S+)/, 10_000);
    expect(match[1]).toBe("http://localhost:5173/");
    await registry.stop(started.id);
  }, 20_000);

  it("rejects the wait when the process ends before the pattern appears", async () => {
    const registry = new ProcessRegistry();
    const started = registry.start(process.execPath, { args: ["-e", "console.log('bye')"] });
    await expect(registry.waitFor(started.id, /never/, 10_000)).rejects.toThrow(/exited/);
  }, 20_000);

  it("stops every process of the registry when the host ends", async () => {
    // A host process that starts a sleeper through the registry, prints its pid, then exits.
    // The host imports the build output, so this test needs `pnpm build` first.
    const host = [
      `import { processes } from ${JSON.stringify(new URL("../../dist/command/index.js", import.meta.url).href)};`,
      "const started = processes.start(process.execPath, { args: ['-e', 'setInterval(() => {}, 1000)'] });",
      "console.log(started.pid);",
      "setTimeout(() => process.exit(0), 300);",
    ].join("\n");
    const child = spawn(process.execPath, ["--input-type=module", "-e", host], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let text = "";
    child.stdout.on("data", (chunk: Buffer) => (text += chunk.toString()));
    await new Promise((resolve) => child.on("close", resolve));
    const sleeper = Number(text.trim());
    expect(sleeper).toBeGreaterThan(0);
    const end = Date.now() + 5000;
    while (alive(sleeper) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(alive(sleeper)).toBe(false);
  }, 20_000);
});

/** The number of subscribers of a process: a follower that ended must leave none. */
function subscribers(registry: ProcessRegistry, id: string): number {
  return (registry as unknown as { entries: Map<string, { listeners: Set<unknown> }> }).entries.get(id)?.listeners.size ?? 0;
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

/** The text of the output items of a follow, by stream. */
function texts(items: ProcessFollowItem[], stream: "stdout" | "stderr"): string {
  return items.map((item) => (item.type === "output" && item.stream === stream ? item.text : "")).join("");
}

describe("the subscribers of the output", () => {
  it("subscribe gives each piece with its stream, then the end, and the end removes the subscriber", async () => {
    const registry = new ProcessRegistry();
    const script = "process.stdout.write('out 1\\n'); process.stderr.write('err 1\\n'); setTimeout(() => process.stdout.write('out 2\\n'), 50)";
    const started = registry.start(process.execPath, { args: ["-e", script] });
    const chunks: Array<{ stream: string; text: string }> = [];
    let end: ManagedProcessInfo | undefined;
    const unsubscribe = registry.subscribe(started.id, {
      output: (chunk) => chunks.push({ stream: chunk.stream, text: chunk.data.toString("utf8") }),
      end: (info) => (end = info),
    });
    expect(unsubscribe).toBeTypeOf("function");
    expect(subscribers(registry, started.id)).toBe(1);
    await registry.exited(started.id);

    expect(chunks.filter((chunk) => chunk.stream === "stdout").map((chunk) => chunk.text).join("")).toBe("out 1\nout 2\n");
    expect(chunks.filter((chunk) => chunk.stream === "stderr").map((chunk) => chunk.text).join("")).toBe("err 1\n");
    expect(end).toMatchObject({ id: started.id, status: "exited", exitCode: 0 });
    expect(subscribers(registry, started.id)).toBe(0);

    // An ended process gives the end at once. An unknown id gives no subscription.
    let late: ManagedProcessInfo | undefined;
    registry.subscribe(started.id, { end: (info) => (late = info) })!();
    expect(late).toMatchObject({ status: "exited" });
    expect(registry.subscribe("missing", {})).toBeUndefined();
  }, 20_000);

  it("unsubscribe stops the calls, and an error of a subscriber does not reach the registry", async () => {
    const registry = new ProcessRegistry();
    const started = registry.start(process.execPath, { args: ["-e", "let n = 0; const t = setInterval(() => { console.log('tick ' + ++n); if (n === 5) clearInterval(t); }, 20)"] });
    let calls = 0;
    const unsubscribe = registry.subscribe(started.id, {
      output: () => {
        calls++;
        throw new Error("a broken subscriber");
      },
    })!;
    await registry.waitFor(started.id, /tick 2/, 10_000);
    unsubscribe();
    const seen = calls;
    expect(seen).toBeGreaterThan(0);
    expect(subscribers(registry, started.id)).toBe(0);
    await registry.exited(started.id);
    expect(calls).toBe(seen);
    expect(registry.output(started.id)).toContain("tick 5");
  }, 20_000);

  it("follow gives the backlog without a gap, the new output in UTF-8, and the end", async () => {
    const registry = new ProcessRegistry();
    // The second write splits the two bytes of é over two pieces
    const script = [
      "console.log('first');",
      "setTimeout(() => process.stdout.write(Buffer.from([0x73, 0xc3])), 150);",
      "setTimeout(() => { process.stdout.write(Buffer.from([0xa9, 0x0a])); process.stderr.write('warn\\n'); }, 250);",
    ].join("");
    const started = registry.start(process.execPath, { args: ["-e", script] });
    await registry.waitFor(started.id, /first/, 10_000);
    const items = await collect(registry.follow(started.id, { backlog: true }));

    expect(items[0]).toEqual({ type: "backlog", text: "first\n" });
    expect(texts(items, "stdout")).toBe("sé\n");
    expect(texts(items, "stderr")).toBe("warn\n");
    expect(items.at(-1)).toMatchObject({ type: "end", info: { id: started.id, status: "exited", exitCode: 0 } });
    expect(subscribers(registry, started.id)).toBe(0);

    // A follow of an ended process gives only the end
    expect(await collect(registry.follow(started.id))).toEqual([{ type: "end", info: expect.objectContaining({ status: "exited" }) }]);
    await expect(collect(registry.follow("missing"))).rejects.toThrow("No process missing");
  }, 20_000);

  it("follow ends at an abort and at a reader that stops, and leaves no subscriber", async () => {
    const registry = new ProcessRegistry();
    const started = registry.start(process.execPath, { args: ["-e", "let n = 0; setInterval(() => console.log('tick ' + ++n), 10)"] });
    try {
      const controller = new AbortController();
      const aborted = registry.follow(started.id, { signal: controller.signal });
      expect((await aborted.next()).value).toMatchObject({ type: "output", stream: "stdout" });
      expect(subscribers(registry, started.id)).toBe(1);
      const waiting = aborted.next();
      controller.abort();
      // The waiting read ends: either with an item that came first, or with the end of the stream
      await waiting;
      expect(await aborted.next()).toEqual({ value: undefined, done: true });
      expect(subscribers(registry, started.id)).toBe(0);

      let read = 0;
      for await (const item of registry.follow(started.id)) {
        expect(item.type).toBe("output");
        if (++read === 3) break;
      }
      expect(subscribers(registry, started.id)).toBe(0);
      // An aborted signal gives an empty stream
      expect(await collect(registry.follow(started.id, { signal: AbortSignal.abort() }))).toEqual([]);
      expect(registry.get(started.id)?.status).toBe("running");
    } finally {
      await registry.stop(started.id);
    }
  }, 20_000);

  it("follow drops the oldest pieces for a slow reader, and gives the number of bytes", async () => {
    const registry = new ProcessRegistry();
    const script = "setTimeout(() => { for (let i = 0; i < 200; i++) process.stdout.write('x'.repeat(999) + '\\n'); }, 100)";
    const started = registry.start(process.execPath, { args: ["-e", script] });
    const follower = registry.follow(started.id, { maxBufferedBytes: 4096 });
    // The first read starts the subscription. The reader then waits for the end of the process.
    const first = follower.next();
    await registry.exited(started.id);
    const items = [(await first).value as ProcessFollowItem, ...(await collect(follower))];

    const dropped = items.filter((item): item is Extract<ProcessFollowItem, { type: "dropped" }> => item.type === "dropped");
    expect(dropped.length).toBeGreaterThan(0);
    const kept = Buffer.byteLength(texts(items, "stdout"));
    expect(kept + dropped.reduce((sum, item) => sum + item.bytes, 0)).toBe(200 * 1000);
    expect(kept).toBeLessThan(200 * 1000);
    expect(items.at(-1)).toMatchObject({ type: "end" });
  }, 20_000);
});
