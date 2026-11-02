// Tests of the pure parts of the setup profile (O90). No test starts a process or times code.
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { bytesOf, diffOf, groupOf, keyOf, markdownOf, selfTimesOf, summaryOf } from "./setup-profile.mjs";

const tree = resolve("trees", "head");
const url = (/** @type {string} */ ...parts) => pathToFileURL(join(tree, ...parts)).href;

describe("setup-profile", () => {
  it("gives the key of a file of the tree, of a package of node_modules and of Node.js", () => {
    assert.equal(keyOf(url("packages", "client", "dist", "kernel", "program.js"), tree), "packages/client/dist/kernel/program.js");
    assert.equal(keyOf(url("node_modules", ".pnpm", "zod@4.1.0", "node_modules", "zod", "index.js"), tree), "npm:zod");
    assert.equal(keyOf(url("node_modules", "@mark1russell7", "cue", "dist", "a.js"), tree), "npm:@mark1russell7/cue");
    assert.equal(keyOf("node:internal/modules/esm/loader", tree), "node:internal");
    assert.equal(keyOf(pathToFileURL(resolve("elsewhere", "child.mjs")).href, tree), "other");
  });

  it("gives the group of a key", () => {
    assert.equal(groupOf("packages/client/dist/kernel/program.js"), "packages/client");
    assert.equal(groupOf("npm:zod"), "npm");
    assert.equal(groupOf("(garbage collector)"), "(garbage collector)");
  });

  it("gives the self time of each key: the time to the next sample", () => {
    const profile = {
      nodes: [
        { id: 1, callFrame: { url: "", functionName: "(root)" } },
        { id: 2, callFrame: { url: url("packages", "client", "dist", "a.js"), functionName: "f" } },
        { id: 3, callFrame: { url: "", functionName: "(garbage collector)" } },
      ],
      samples: [2, 2, 3, 2],
      timeDeltas: [0, 1000, 500, 2000],
    };
    assert.deepEqual(selfTimesOf(profile, tree), { "packages/client/dist/a.js": 1.5, "(garbage collector)": 2 });
  });

  it("adds the bytes of the files of one package of node_modules", () => {
    const bytes = bytesOf(
      [
        { url: url("node_modules", "zod", "a.js"), bytes: 10 },
        { url: url("node_modules", "zod", "b.js"), bytes: 5 },
        { url: "node:fs", bytes: 0 },
      ],
      tree,
    );
    assert.deepEqual(bytes, { "npm:zod": 15, "node:internal": 0 });
  });

  it("gives the added self time of each file and group, and its share, from the largest", () => {
    const base = summaryOf([
      { setupMs: 10, self: { "packages/client/dist/a.js": 2, "(program)": 4 }, bytes: { "packages/client/dist/a.js": 100 } },
      { setupMs: 12, self: { "packages/client/dist/a.js": 4, "(program)": 4 }, bytes: { "packages/client/dist/a.js": 100 } },
    ]);
    const head = summaryOf([
      { setupMs: 20, self: { "packages/client/dist/a.js": 3, "packages/client/dist/b.js": 6, "(program)": 5 }, bytes: { "packages/client/dist/a.js": 100, "packages/client/dist/b.js": 400 } },
    ]);
    assert.equal(base.setupMs, 11);
    assert.equal(base.files["packages/client/dist/a.js"].ms, 3);
    const diff = diffOf(base, head);
    assert.equal(diff.addedMs, 7);
    assert.equal(diff.addedBytes, 400);
    assert.deepEqual(
      diff.files.map((r) => [r.key, r.addedMs]),
      [
        ["packages/client/dist/b.js", 6],
        ["(program)", 1],
        ["packages/client/dist/a.js", 0],
      ],
    );
    assert.equal(diff.groups[0].key, "packages/client");
    assert.equal(diff.groups[0].addedMs, 6);
    assert.equal(diff.groups[0].share, 6 / 7);
    const md = markdownOf({ base: { ref: "b" }, head: { ref: "h" }, inputs: { "exec-one-call-setup": { base, head, diff } } });
    assert.ok(md.includes("| `packages/client/dist/b.js` | 0.00 | 6.00 | 6.00 | 85.7 % | 0.0 | 0.4 | 0.4 |"));
  });
});
