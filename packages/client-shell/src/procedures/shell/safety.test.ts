/**
 * shell.which runs no shell (deep dive WRP-6), and shell.stream keeps a character whose bytes
 * arrive in two chunks (deep dive WRP-2).
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import "../../register.js";
import { shellWhich } from "./which.js";
import type { ShellStreamItem } from "../../types.js";

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

describe("shell.which", () => {
  it("finds a program", async () => {
    const result = await shellWhich({ command: "node" });
    expect(result.found).toBe(true);
  });

  it("passes the name as one argument: shell syntax in it runs nothing", async () => {
    const marker = join(tmpdir(), `which-marker-${process.pid}-${Date.now()}`);
    const result = await shellWhich({ command: `nosuchprogram & echo marker> "${marker}"` });
    expect(result.found).toBe(false);
    expect(existsSync(marker)).toBe(false);
  });
});

describe("shell.stream decoding", () => {
  it("keeps a multibyte character that is split across two writes", async () => {
    // The euro sign is the three bytes E2 82 AC: the script writes the first one, waits, then the rest
    const script = [
      "process.stdout.write(Buffer.from([0x41, 0x42, 0xe2]));",
      "setTimeout(() => process.stdout.write(Buffer.from([0x82, 0xac, 0x5a, 0x0a])), 50);",
    ].join("");
    const lines: string[] = [];
    for await (const item of client.stream<unknown, ShellStreamItem>(
      { service: "shell", operation: "stream" },
      { command: process.execPath, args: ["-e", script] },
    )) {
      if (item.type === "stdout") lines.push(item.line);
    }
    expect(lines).toEqual([`AB${String.fromCodePoint(0x20ac)}Z`]);
  });
});
