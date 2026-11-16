/**
 * The hold of the roots (`root-hold.ts`): the check of a path and its use read the same links.
 *
 * - Shared holds start together. The exclusive hold starts alone, in the order of the calls.
 * - A nested call starts in the hold of its caller. A shared hold cannot become exclusive.
 * - The moves of other calls wait until a write ends, so the write stays in the root.
 * - A confined procedure that writes files holds the roots alone. One that only reads shares them.
 * - `openWatch()` opens its watcher at once, so a change before the first read reaches the stream.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { platform } from "node:process";
import {
  coreProcedures,
  createRegistry,
  defineModule,
  defineProcedure,
  invokePath,
  outputSchema,
  outputValue,
  type AnyProcedure,
  type Effects,
  type ProcedureRegistry,
} from "@procedures/client";
import { confineToRoot, createFsModule, rootHoldOf } from "./module.js";
import { rootedHandlers } from "./handlers.js";
import { holdRoots } from "./root-hold.js";
import { openWatch } from "./procedures/fs/watch.js";

/** A hook after each `realpath` of the check: a test starts other calls between the check and the use here. */
const gate = vi.hoisted(() => ({ after: undefined as ((path: string) => Promise<void>) | undefined }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const realpath = (async (path: Parameters<typeof actual.realpath>[0], options?: Parameters<typeof actual.realpath>[1]) => {
    const real = await actual.realpath(path, options);
    await gate.after?.(String(path));
    return real;
  }) as typeof actual.realpath;
  return { ...actual, realpath, default: { ...actual, realpath } };
});

/** A promise that resolves after `ms` milliseconds. */
function delay(ms: number): Promise<"time"> {
  return new Promise((resolve) => setTimeout(() => resolve("time"), ms));
}

/** A gate that a test opens: `wait` resolves after `open()`. */
function latch(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => (open = resolve));
  return { wait, open };
}

/** A link to a folder: a junction on Windows (no privilege needed), a symlink elsewhere. */
function linkFolder(target: string, path: string): void {
  symlinkSync(target, path, platform === "win32" ? "junction" : "dir");
}

let base: string;
let root: string;
let outside: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "client-fs-hold-"));
  root = join(base, "root");
  outside = join(base, "outside");
  mkdirSync(root);
  mkdirSync(outside);
});

afterEach(() => {
  gate.after = undefined;
  rmSync(base, { recursive: true, force: true });
});

describe("holdRoots", () => {
  it("starts shared holds together", async () => {
    const first = latch();
    const second = latch();
    const both = Promise.all([
      holdRoots("shared", async () => {
        second.open();
        await first.wait;
      }),
      holdRoots("shared", async () => {
        first.open();
        await second.wait;
      }),
    ]);
    expect(await Promise.race([both.then(() => "ended"), delay(1000)])).toBe("ended");
  });

  it("starts the exclusive hold alone, in the order of the calls", async () => {
    const order: string[] = [];
    const reading = latch();
    const first = holdRoots("shared", async () => {
      order.push("read 1 starts");
      await reading.wait;
      order.push("read 1 ends");
    });
    const move = holdRoots("exclusive", async () => {
      order.push("move");
    });
    // A shared call after the exclusive call waits behind it
    const second = holdRoots("shared", async () => {
      order.push("read 2");
    });
    await delay(20);
    expect(order).toEqual(["read 1 starts"]);
    reading.open();
    await Promise.all([first, move, second]);
    expect(order).toEqual(["read 1 starts", "read 1 ends", "move", "read 2"]);
  });

  it("starts a nested call in the hold of its caller", async () => {
    const outer = latch();
    const inExclusive = holdRoots("exclusive", async () => {
      await outer.wait;
      return [await holdRoots("shared", async () => "shared"), await holdRoots("exclusive", async () => "exclusive")];
    });
    // An exclusive call waits behind the shared hold, and the nested shared call of that hold does not wait
    const inShared = latch();
    const shared = holdRoots("shared", async () => {
      await inShared.wait;
      return holdRoots("shared", async () => "nested");
    });
    outer.open();
    expect(await inExclusive).toEqual(["shared", "exclusive"]);
    const waiting = holdRoots("exclusive", async () => "after");
    inShared.open();
    expect(await shared).toBe("nested");
    expect(await waiting).toBe("after");
  });

  it("gives an error to a call in a shared hold that asks for the exclusive hold", async () => {
    await expect(holdRoots("shared", () => holdRoots("exclusive", async () => "no"))).rejects.toThrow("cannot start a call that needs the exclusive hold");
    // The error ended the hold
    expect(await holdRoots("exclusive", async () => "free")).toBe("free");
  });

  it("ends the hold when the work throws", async () => {
    await expect(
      holdRoots("exclusive", async () => {
        throw new Error("the disk is full");
      }),
    ).rejects.toThrow("the disk is full");
    expect(await Promise.race([holdRoots("exclusive", async () => "free"), delay(1000)])).toBe("free");
  });

  it("gives no hold to work that a call left behind", async () => {
    const later = await new Promise<Promise<string>>((resolve) => {
      void holdRoots("shared", async () => {
        // This timer starts after the hold ends, in the async context of the hold
        setTimeout(() => resolve(holdRoots("exclusive", async () => "own hold")), 10);
      });
    });
    expect(await later).toBe("own hold");
  });
});

describe("the check and the use of a path", () => {
  it("keeps a write in the root: the moves of other calls wait until the write ends", async () => {
    // The root holds a folder repo with a linked folder sub, and a plain folder w/sub
    mkdirSync(join(root, "repo"));
    linkFolder(outside, join(root, "repo", "sub"));
    mkdirSync(join(root, "w", "sub"), { recursive: true });
    const handlers = rootedHandlers(root);
    // The hook starts in the async context of the write, so it is in the hold of the write. The
    // context of the test has no hold: the moves start there, as the calls of other clients.
    const atTest = AsyncLocalStorage.snapshot();
    let moves: Promise<unknown> | undefined;
    let raced: string | undefined;
    gate.after = async (path) => {
      if (!path.endsWith(`${sep}w${sep}sub`)) return;
      gate.after = undefined;
      // The two moves start after the check of w/sub/x, before the write
      moves = atTest(async () => {
        await handlers.move({ src: "w", dest: "w0", overwrite: false });
        await handlers.move({ src: "repo", dest: "w", overwrite: false });
      });
      raced = await Promise.race([moves.then(() => "moved"), delay(200)]);
    };
    await handlers.write({ path: join("w", "sub", "x"), content: "text", encoding: "utf8", mode: "write" });
    await moves;
    // The moves waited for the end of the write
    expect(raced).toBe("time");
    expect(existsSync(join(outside, "x"))).toBe(false);
    expect(readFileSync(join(root, "w0", "sub", "x"), "utf8")).toBe("text");
  });
});

describe("the hold of a confined procedure", () => {
  /** A confined procedure with these effects: it waits for `release`, then gives "done". */
  function waiter(key: string, effects: Effects, release: Promise<void>): AnyProcedure {
    return defineProcedure({
      path: key.split("."),
      input: outputSchema<Record<string, unknown>>(),
      output: outputSchema<string>(),
      metadata: { effects, fsRoot: { cwd: "cwd" } },
      handler: async () => {
        await release;
        return "done";
      },
    });
  }

  /** The registry under the root, with the two procedures. */
  function confined(release: Promise<void>): ProcedureRegistry {
    const registry = createRegistry(
      createFsModule(),
      defineModule("test", [waiter("t.change", { reads: ["fs"], writes: ["fs"] }, release), waiter("t.look", { reads: ["fs"], writes: [] }, release)]),
      defineModule("core", coreProcedures),
    );
    confineToRoot(registry, root);
    return registry;
  }

  it("holds the roots alone while a procedure that writes files works", async () => {
    writeFileSync(join(root, "a.txt"), "a");
    const release = latch();
    const registry = confined(release.wait);
    const change = invokePath(["t", "change"], {}, { registry });
    await delay(20);
    const read = invokePath(["fs", "read"], { path: "a.txt" }, { registry }).then(() => "read");
    expect(await Promise.race([read, delay(100)])).toBe("time");
    release.open();
    expect(await outputValue(await change)).toBe("done");
    expect(await read).toBe("read");
  });

  it("shares the roots while a procedure that only reads works", async () => {
    writeFileSync(join(root, "a.txt"), "a");
    const release = latch();
    const registry = confined(release.wait);
    const look = invokePath(["t", "look"], {}, { registry });
    await delay(20);
    const read = invokePath(["fs", "read"], { path: "a.txt" }, { registry }).then(() => "read");
    expect(await Promise.race([read, delay(1000)])).toBe("read");
    release.open();
    expect(await outputValue(await look)).toBe("done");
  });

  it.each([
    [{ reads: ["fs"], writes: [] }, "shared"],
    [{ reads: ["fs"], writes: ["fs"] }, "exclusive"],
    [{ reads: ["docker"], writes: ["docker", "process"] }, "exclusive"],
    [{ reads: ["fs"] }, "exclusive"],
  ] as const)("gives the hold of the effects %j: %s", (effects, hold) => {
    expect(rootHoldOf({ path: ["t", "p"], metadata: { effects: effects as Effects } })).toBe(hold);
  });
});

describe("openWatch", () => {
  it("opens the watcher at once, so a change before the first read reaches the stream", async () => {
    const controller = new AbortController();
    const changes = openWatch({ path: root }, controller.signal);
    writeFileSync(join(root, "new.txt"), "new");
    const first = await Promise.race([changes.next(), delay(5000)]);
    controller.abort();
    expect(first).not.toBe("time");
    expect(await changes.next()).toEqual({ done: true, value: undefined });
  });
});
