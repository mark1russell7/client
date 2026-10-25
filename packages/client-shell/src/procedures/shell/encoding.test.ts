/**
 * An unknown output encoding (audit O56 #9). Before, `Buffer.toString` threw in the "close"
 * listener of the child: the exception ended the host, and the call never settled.
 */

import { describe, it, expect } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import { runCommand, streamCommand } from "../../command/index.js";
import { shellModule } from "../../module.js";
import { ShellRunInputSchema } from "../../types.js";

describe("an unknown output encoding", () => {
  it("shell.run refuses it at the validation of the input, with the name of the encoding", async () => {
    const registry = createRegistry(shellModule);
    const call = invokePath(["shell", "run"], { command: process.execPath, args: ["-e", "1"], encoding: "utf-8x" }, { registry });
    await expect(call).rejects.toThrow(/utf-8x/);
  });

  it("the schema takes each encoding that Buffer knows, in any case", () => {
    for (const encoding of ["utf8", "utf-8", "UTF-8", "latin1", "binary", "base64", "hex", "ucs-2", "utf16le"]) {
      expect(ShellRunInputSchema.safeParse({ command: "x", encoding }).success, encoding).toBe(true);
    }
    for (const encoding of ["utf-8x", "", "ascii7"]) {
      expect(ShellRunInputSchema.safeParse({ command: "x", encoding }).success, encoding).toBe(false);
    }
  });

  it("shell.run still decodes with a known encoding", async () => {
    const registry = createRegistry(shellModule);
    const result = (await outputValue(
      await invokePath(["shell", "run"], { command: process.execPath, args: ["-e", "process.stdout.write('ok')"], encoding: "hex" }, { registry }),
      ["shell", "run"],
    )) as { stdout: string };
    expect(result.stdout).toBe(Buffer.from("ok").toString("hex"));
  });

  it("runCommand gives a failure result and starts no program", async () => {
    const marker = join(tmpdir(), `o56-encoding-${process.pid}-${Date.now()}`);
    try {
      const result = await runCommand(process.execPath, {
        args: ["-e", "require('fs').writeFileSync(process.argv[1], 'started')", marker],
        encoding: "utf-8x" as BufferEncoding,
      });
      expect(result).toMatchObject({ success: false, exitCode: 1, error: 'Unknown encoding: "utf-8x"' });
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(marker, { force: true });
    }
  });

  it("streamCommand throws before it starts the program", async () => {
    const stream = streamCommand(process.execPath, { args: ["-e", "1"], encoding: "utf-8x" as BufferEncoding });
    await expect(stream.next()).rejects.toThrow('Unknown encoding: "utf-8x"');
  });
});
