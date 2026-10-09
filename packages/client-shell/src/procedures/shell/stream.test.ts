/**
 * shell.stream: each output line arrives while the command runs (ARCHITECTURE-PROPOSALS P3).
 */

import { describe, it, expect } from "vitest";
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import "../../register.js";
import type { ShellStreamItem } from "../../types.js";

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));
const method = { service: "shell", operation: "stream" };

describe("shell.stream", () => {
  it("gives each line, then the exit", async () => {
    const items: ShellStreamItem[] = [];
    const script = "console.log('one'); console.error('two'); setTimeout(() => console.log('three'), 30)";
    for await (const item of client.stream<unknown, ShellStreamItem>(method, { command: process.execPath, args: ["-e", script] })) {
      items.push(item);
    }
    const lines = items.filter((item) => item.type !== "exit");
    expect(lines).toEqual(
      expect.arrayContaining([
        { type: "stdout", line: "one" },
        { type: "stderr", line: "two" },
        { type: "stdout", line: "three" },
      ]),
    );
    expect(items.at(-1)).toMatchObject({ type: "exit", exitCode: 0 });
  });

  it("delivers a line before the command ends", async () => {
    // The command runs 5 s after its first line. The reader gets "ready" and stops long before
    // that, which ends the command. (A 400 ms limit failed on a loaded machine: Node took longer
    // than that to start.)
    const script = "console.log('ready'); setTimeout(() => console.log('late'), 5000)";
    const started = Date.now();
    for await (const item of client.stream<unknown, ShellStreamItem>(method, { command: process.execPath, args: ["-e", script] })) {
      if (item.type === "stdout") {
        expect(item.line).toBe("ready");
        expect(Date.now() - started).toBeLessThan(4000);
        break;
      }
    }
  });

  it("ends the command when the reader stops early", async () => {
    const script = "setInterval(() => console.log('tick'), 10)";
    let ticks = 0;
    const started = Date.now();
    for await (const item of client.stream<unknown, ShellStreamItem>(method, { command: process.execPath, args: ["-e", script] })) {
      if (item.type === "stdout" && ++ticks === 3) break;
    }
    expect(ticks).toBe(3);
    // The loop ended: an endless command did not keep the stream open
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
