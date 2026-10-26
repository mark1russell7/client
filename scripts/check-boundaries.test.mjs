// The tests of the import boundaries (roadmap CLI-83): the rules of scripts/lib/boundaries.cjs on a
// fixture repository in a temporary folder. Each bad import must fail its rule, and each good import
// must pass. Start them with: node --test scripts/check-boundaries.test.mjs

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { cruise } from "dependency-cruiser";

const { boundaries } = createRequire(import.meta.url)("./lib/boundaries.cjs");

const root = mkdtempSync(join(tmpdir(), "boundaries-"));
after(() => rmSync(root, { recursive: true, force: true }));

/** This function writes the files of the fixture repository, relative to its root. */
function write(files) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), typeof text === "string" ? text : JSON.stringify(text));
  }
}

/** This function links a fixture package into node_modules, as pnpm links a workspace package. */
function link(name, folder) {
  const path = join(root, "node_modules", name);
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(join(root, "packages", folder), path, "junction");
}

let violations = [];

before(async () => {
  write({
    // The core: a server, a shared helper of the server folder, a barrel and the transports
    "packages/client/package.json": { name: "@procedures/client", type: "module", exports: { ".": "./dist/index.js", "./server": "./dist/server/index.js" } },
    "packages/client/dist/index.js": "export {};\n",
    "packages/client/dist/server/index.js": "export {};\n",
    "packages/client/src/index.ts": `export { ProcedureServer } from "./server/procedure-server.js";\n`,
    "packages/client/src/server/procedure-server.ts": `import { methodName } from "./method.js";\nexport class ProcedureServer { name = methodName; }\n`,
    "packages/client/src/server/method.ts": `export const methodName = "m";\n`,
    "packages/client/src/server/stream-metadata.ts": `export const STREAM_METADATA_KEY = "stream";\n`,
    "packages/client/src/adapters/http/server/good.ts": `import { methodName } from "../../../server/method.js";\nimport { STREAM_METADATA_KEY } from "../../../server/stream-metadata.js";\nexport const both = [methodName, STREAM_METADATA_KEY];\n`,
    "packages/client/src/adapters/http/server/imports-server.ts": `import { ProcedureServer } from "../../../server/procedure-server.js";\nexport const server = ProcedureServer;\n`,
    "packages/client/src/adapters/http/server/type-import.ts": `import type { ProcedureServer } from "../../../server/procedure-server.js";\nexport type Server = ProcedureServer;\n`,
    "packages/client/src/adapters/websocket/through-barrel.ts": `import { ProcedureServer } from "../../index.js";\nexport const server = ProcedureServer;\n`,
    "packages/client/src/adapters/websocket/server.test.ts": `import { ProcedureServer } from "../../server/procedure-server.js";\nexport const server = ProcedureServer;\n`,
    // The MCP transport and its host
    "packages/client-mcp/package.json": { name: "@procedures/mcp-server", type: "module", exports: { ".": "./dist/index.js" } },
    "packages/client-mcp/src/host.ts": `export const host = 1;\n`,
    "packages/client-mcp/src/transport/good.ts": `import { client } from "@procedures/client";\nexport const value = client;\n`,
    "packages/client-mcp/src/transport/server-entry.ts": `import { server } from "@procedures/client/server";\nexport const value = server;\n`,
    "packages/client-mcp/src/transport/host.ts": `import { host } from "../host.js";\nexport const value = host;\n`,
    "packages/client-mcp/src/transport/server-package.ts": `import { start } from "@procedures/server";\nexport const value = start;\n`,
    // Two libraries
    "packages/lib-a/package.json": { name: "@procedures/lib-a", type: "module", exports: { ".": "./dist/index.js" } },
    "packages/lib-a/src/inside.ts": `import { x } from "./sub/x.js";\nexport const value = x;\n`,
    "packages/lib-a/src/sub/x.ts": `export const x = 1;\n`,
    "packages/lib-a/src/by-name.ts": `import { b } from "@procedures/lib-b";\nexport const value = b;\n`,
    "packages/lib-a/src/relative-src.ts": `import { y } from "../../lib-b/src/y.js";\nexport const value = y;\n`,
    "packages/lib-a/src/relative-dist.ts": `import { b } from "../../lib-b/dist/index.js";\nexport const value = b;\n`,
    "packages/lib-a/src/name-src.ts": `import { y } from "@procedures/lib-b/src/y.js";\nexport const value = y;\n`,
    "packages/lib-a/src/not-exported.ts": `import { y } from "@procedures/lib-b/internal";\nexport const value = y;\n`,
    "packages/lib-a/src/app-by-name.ts": `import { page } from "@procedures/site";\nexport const value = page;\n`,
    "packages/lib-b/package.json": { name: "@procedures/lib-b", type: "module", exports: { ".": "./dist/index.js" } },
    "packages/lib-b/dist/index.js": "export const b = 1;\n",
    "packages/lib-b/src/y.ts": `export const y = 1;\n`,
    // An app: private, a leaf
    "packages/site/package.json": { name: "@procedures/site", private: true, type: "module" },
    "packages/site/src/page.ts": `import { b } from "@procedures/lib-b";\nexport const page = b;\n`,
  });
  link("@procedures/client", "client");
  link("@procedures/lib-b", "lib-b");
  link("@procedures/site", "site");

  const { forbidden, options } = boundaries(root);
  const result = await cruise(["packages/client/src", "packages/client-mcp/src", "packages/lib-a/src", "packages/lib-b/src", "packages/site/src"], {
    ...options,
    baseDir: root,
    validate: true,
    ruleSet: { forbidden },
  });
  violations = result.output.summary.violations.map(({ rule, from, to }) => `${rule.name}: ${from} -> ${to}`);
});

/** The violations of one source file of the fixture. */
const of = (from) => violations.filter((violation) => violation.includes(`: ${from} -> `)).sort();

describe("the import boundaries (I9, CLI-83)", () => {
  it("a transport does not import the server, with a value or a type", () => {
    assert.deepEqual(of("packages/client/src/adapters/http/server/imports-server.ts"), [
      "transport-imports-server: packages/client/src/adapters/http/server/imports-server.ts -> packages/client/src/server/procedure-server.ts",
      "transport-reaches-server: packages/client/src/adapters/http/server/imports-server.ts -> packages/client/src/server/procedure-server.ts",
    ]);
    assert.equal(of("packages/client/src/adapters/http/server/type-import.ts").length, 2);
  });

  it("a transport does not reach the server through a barrel", () => {
    assert.deepEqual(of("packages/client/src/adapters/websocket/through-barrel.ts"), [
      "transport-reaches-server: packages/client/src/adapters/websocket/through-barrel.ts -> packages/client/src/server/procedure-server.ts",
    ]);
  });

  it("the MCP transport does not import the server entry, the host or a server package", () => {
    assert.deepEqual(of("packages/client-mcp/src/transport/server-entry.ts"), [
      "transport-imports-server: packages/client-mcp/src/transport/server-entry.ts -> packages/client/dist/server/index.js",
      "transport-reaches-server: packages/client-mcp/src/transport/server-entry.ts -> packages/client/dist/server/index.js",
    ]);
    assert.ok(of("packages/client-mcp/src/transport/host.ts").includes("transport-imports-server: packages/client-mcp/src/transport/host.ts -> packages/client-mcp/src/host.ts"));
    assert.ok(of("packages/client-mcp/src/transport/server-package.ts").includes("transport-imports-server: packages/client-mcp/src/transport/server-package.ts -> @procedures/server"));
  });

  it("a relative import does not leave its package, into src/ or into dist/", () => {
    assert.deepEqual(of("packages/lib-a/src/relative-src.ts"), [
      "import-of-another-package-src: packages/lib-a/src/relative-src.ts -> packages/lib-b/src/y.ts",
      "relative-import-into-another-package: packages/lib-a/src/relative-src.ts -> packages/lib-b/src/y.ts",
    ]);
    assert.deepEqual(of("packages/lib-a/src/relative-dist.ts"), ["relative-import-into-another-package: packages/lib-a/src/relative-dist.ts -> packages/lib-b/dist/index.js"]);
  });

  it("an import by name reaches only an entry of the exports map", () => {
    assert.deepEqual(of("packages/lib-a/src/name-src.ts"), [
      "import-of-another-package-src: packages/lib-a/src/name-src.ts -> @procedures/lib-b/src/y.js",
      "not-a-declared-export: packages/lib-a/src/name-src.ts -> @procedures/lib-b/src/y.js",
    ]);
    assert.deepEqual(of("packages/lib-a/src/not-exported.ts"), ["not-a-declared-export: packages/lib-a/src/not-exported.ts -> @procedures/lib-b/internal"]);
  });

  it("no package imports an app", () => {
    assert.ok(of("packages/lib-a/src/app-by-name.ts").includes("import-of-an-app: packages/lib-a/src/app-by-name.ts -> @procedures/site"));
  });

  it("the good imports pass: shared helpers, imports inside a package, entries of the exports map, an app that imports a library, and the tests", () => {
    for (const file of [
      "packages/client/src/adapters/http/server/good.ts",
      "packages/client/src/adapters/websocket/server.test.ts",
      "packages/client/src/server/procedure-server.ts",
      "packages/client/src/index.ts",
      "packages/client-mcp/src/transport/good.ts",
      "packages/lib-a/src/inside.ts",
      "packages/lib-a/src/by-name.ts",
      "packages/site/src/page.ts",
    ]) {
      assert.deepEqual(of(file), [], file);
    }
  });
});
