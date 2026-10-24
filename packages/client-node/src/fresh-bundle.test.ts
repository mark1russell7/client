/**
 * The fresh bundle (`@procedures/node/fresh-bundle`): a build runs only while each file that it
 * comes from is unchanged.
 *
 * The first part calls `build`, `freshEntry` and `launch` in this process, on a project in a
 * temporary folder. The second part starts `launch` of the built `dist/fresh-bundle.js` in a new
 * Node.js process, as a CLI does. No test uses the network.
 *
 * The module runner of Vitest has no `import.meta.resolve`. Thus only the second part shows where
 * a package resolves to.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build, freshEntry, launch, type FreshBundleSpec } from "./fresh-bundle.js";

/** The built module, as a consumer imports it. `pnpm build` comes before `pnpm test`. */
const builtModule = fileURLToPath(new URL("../dist/fresh-bundle.js", import.meta.url));

/** Each test of `launch` starts Node.js and a build or tsx: some seconds on a loaded computer. */
const SLOW = { timeout: 60_000 };

/** A project in a new temporary folder: an entry, a module that it imports, a lockfile and a package. */
interface Project {
  readonly dir: string;
  readonly entry: string;
  readonly dep: string;
  readonly lock: string;
  readonly outDir: string;
}

/** The entry of a CLI: it writes one row and sets the exit code. */
const CLI_ENTRY = [
  "#!/usr/bin/env node",
  'import { basename } from "node:path";',
  'import { VERSION } from "./dep.ts";',
  'import { where } from "fake-pkg";',
  "// The frames of a bundle are in fresh-out. The frames of the source are in src.",
  'const stack: string = new Error().stack ?? "";',
  "console.log(JSON.stringify({",
  "  version: VERSION,",
  "  where,",
  '  bundled: stack.includes("fresh-out"),',
  "  url: import.meta.url,",
  "  dirname: import.meta.dirname,",
  "  filename: import.meta.filename,",
  "  name: basename(import.meta.filename),",
  "  argv: process.argv.slice(2),",
  "  argv1: process.argv[1],",
  "}));",
  "process.exitCode = 3;",
  "// A dynamic import of a package that does not exist fails only when it runs, as under tsx.",
  'export const later = (): Promise<unknown> => import("no-such-package");',
  "",
].join("\n");

/** The entry for a launch in this process: it keeps its row in a global, and leaves the exit code. */
const QUIET_ENTRY = [
  'import { VERSION } from "./dep.ts";',
  "const row = { version: VERSION, argv1: process.argv[1], url: import.meta.url };",
  "(globalThis as Record<string, unknown>).__freshBundleRow = row;",
  "",
].join("\n");

function makeProject(entrySource: string = CLI_ENTRY): Project {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "fresh-bundle-")));
  mkdirSync(join(dir, "src"));
  const entry = join(dir, "src", "entry.ts");
  const dep = join(dir, "src", "dep.ts");
  const lock = join(dir, "lock.yaml");
  writeFileSync(entry, entrySource);
  writeFileSync(dep, 'export const VERSION: string = "v1";\n');
  writeFileSync(lock, "lock: 1\n");
  // An ES module project, as the bundle is: without it, tsx loads the entry as CommonJS.
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", private: true, type: "module" }));
  // A package with two conditions: Node.js gives the "import" file to an ES module.
  const pkg = join(dir, "node_modules", "fake-pkg");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    join(pkg, "package.json"),
    JSON.stringify({ name: "fake-pkg", type: "module", exports: { import: "./esm.js", require: "./cjs.cjs" } }),
  );
  writeFileSync(join(pkg, "esm.js"), 'export const where = "esm";\n');
  writeFileSync(join(pkg, "cjs.cjs"), 'exports.where = "cjs";\n');
  return { dir, entry, dep, lock, outDir: join(dir, "fresh-out") };
}

const specOf = (project: Project, inputs: readonly string[] = [project.lock]): FreshBundleSpec => ({
  entry: project.entry,
  outDir: project.outDir,
  inputs,
});

interface CurrentRecord {
  readonly main: string;
  readonly inputs: Record<string, string | null>;
}

const currentOf = (outDir: string): CurrentRecord =>
  JSON.parse(readFileSync(join(outDir, "current.json"), "utf8")) as CurrentRecord;

/** This function writes new content with the size and the modification time of the old content. */
function sameSizeAndTime(file: string, text: string): void {
  const { atime, mtime, size } = statSync(file);
  writeFileSync(file, text);
  utimesSync(file, atime, mtime);
  expect(statSync(file).size).toBe(size);
  expect(statSync(file).mtimeMs).toBe(mtime.getTime());
}

describe("build and freshEntry", SLOW, () => {
  let project: Project;

  beforeAll(() => {
    project = makeProject();
  });

  afterAll(() => {
    rmSync(project.dir, { recursive: true, force: true });
  });

  it("has no fresh entry before the first build", () => {
    expect(freshEntry(specOf(project))).toBeUndefined();
  });

  it("builds the entry, and records the hash of each source and each input", async () => {
    await build(specOf(project));
    const main = freshEntry(specOf(project));
    expect(main).toBeDefined();
    expect(main?.startsWith(project.outDir)).toBe(true);
    expect(main?.endsWith("entry.mjs")).toBe(true);
    const { inputs } = currentOf(project.outDir);
    expect(Object.keys(inputs)).toEqual(expect.arrayContaining([project.entry, project.dep, project.lock]));
    const bundle = readFileSync(main ?? "", "utf8");
    // The package stays outside the bundle: the bundle does not contain its code.
    expect(bundle).not.toContain('"esm"');
    // The hashbang stays on the first line, and the entry has its own import.meta.url.
    expect(bundle.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(bundle).toContain(JSON.stringify(pathToFileURL(project.entry).href));
  });

  it("makes the same build again from the same files", async () => {
    const before = currentOf(project.outDir).main;
    await build(specOf(project));
    expect(currentOf(project.outDir).main).toBe(before);
  });

  it("has no fresh entry after an edit with the same size and modification time", async () => {
    const before = freshEntry(specOf(project));
    sameSizeAndTime(project.dep, 'export const VERSION: string = "v9";\n');
    expect(freshEntry(specOf(project))).toBeUndefined();
    await build(specOf(project));
    const after = freshEntry(specOf(project));
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
  });

  it("has no fresh entry after a change of an input that is not a source (the lockfile)", () => {
    writeFileSync(project.lock, "lock: 2\n");
    expect(freshEntry(specOf(project))).toBeUndefined();
  });

  it("has no fresh entry when the spec names a new input or another entry", async () => {
    await build(specOf(project));
    expect(freshEntry(specOf(project))).toBeDefined();
    expect(freshEntry(specOf(project, [project.lock, join(project.dir, "new", "package.json")]))).toBeUndefined();
    expect(freshEntry({ ...specOf(project), entry: project.dep })).toBeUndefined();
  });

  it("has no fresh entry when the build is gone or the record is not valid", async () => {
    const main = freshEntry(specOf(project));
    expect(main).toBeDefined();
    rmSync(dirname(main ?? ""), { recursive: true, force: true });
    expect(freshEntry(specOf(project))).toBeUndefined();
    await build(specOf(project));
    const record = join(project.outDir, "current.json");
    const text = readFileSync(record, "utf8");
    const bad = [
      "not json",
      "null",
      JSON.stringify({ version: 1, entry: project.entry, inputs: {} }),
      JSON.stringify({ version: 1, entry: project.entry, main: "x.mjs" }),
      JSON.stringify({ ...(JSON.parse(text) as object), version: 0 }),
    ];
    for (const content of bad) {
      writeFileSync(record, content);
      expect(freshEntry(specOf(project))).toBeUndefined();
    }
    writeFileSync(record, text);
    expect(freshEntry(specOf(project))).toBeDefined();
  });

  it("removes the builds that no launch used for 6 hours, and keeps the others", async () => {
    const old = join(project.outDir, "old-build");
    const recent = join(project.outDir, "recent-build");
    mkdirSync(old);
    mkdirSync(recent);
    const longAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
    utimesSync(old, longAgo, longAgo);
    writeFileSync(project.dep, 'export const VERSION: string = "v2";\n');
    await build(specOf(project));
    expect(existsSync(old)).toBe(false);
    expect(existsSync(recent)).toBe(true);
    expect(readdirSync(project.outDir).filter((name) => name.startsWith("tmp-"))).toEqual([]);
  });

  it("refuses a source with an import.meta other than url, dirname or filename", async () => {
    const other = makeProject();
    try {
      writeFileSync(other.dep, 'export const VERSION: string = import.meta.resolve("./x.ts");\n');
      await expect(build(specOf(other))).rejects.toThrow(/import\.meta other than url, dirname or filename/);
      expect(existsSync(join(other.outDir, "current.json"))).toBe(false);
      expect(readdirSync(other.outDir)).toEqual([]);
    } finally {
      rmSync(other.dir, { recursive: true, force: true });
    }
  });

  it("records a missing input as missing, and builds again when it appears", async () => {
    const later = join(project.dir, "packages", "later", "package.json");
    await build(specOf(project, [project.lock, later]));
    expect(currentOf(project.outDir).inputs[later]).toBeNull();
    expect(freshEntry(specOf(project, [project.lock, later]))).toBeDefined();
    mkdirSync(dirname(later), { recursive: true });
    writeFileSync(later, "{}\n");
    expect(freshEntry(specOf(project, [project.lock, later]))).toBeUndefined();
  });

  it("fails when it cannot import esbuild", async () => {
    const spec = { ...specOf(project), esbuild: pathToFileURL(join(project.dir, "no-such-esbuild.mjs")).href };
    await expect(build(spec)).rejects.toThrow();
  });
});

describe("launch in this process", SLOW, () => {
  let project: Project;
  const rowOf = (): unknown => (globalThis as Record<string, unknown>)["__freshBundleRow"];

  /** This function starts `launch`, and gives `process.argv[1]` of this process back after it. */
  const launchHere = async (): Promise<void> => {
    const argv1 = process.argv[1];
    try {
      await launch(specOf(project));
    } finally {
      process.argv[1] = argv1 ?? "";
    }
  };

  beforeAll(() => {
    project = makeProject(QUIET_ENTRY);
  });

  afterAll(() => {
    rmSync(project.dir, { recursive: true, force: true });
  });

  it("runs the fresh build, with the entry as process.argv[1]", async () => {
    await build(specOf(project));
    await launchHere();
    expect(rowOf()).toEqual({ version: "v1", argv1: project.entry, url: pathToFileURL(project.entry).href });
  });

  // The child process of the build imports this module from its TypeScript source here.
  it.runIf(Boolean(process.features.typescript))(
    "makes a new build in a child process when no build is fresh, and runs it",
    async () => {
      writeFileSync(project.dep, 'export const VERSION: string = "v2";\n');
      expect(freshEntry(specOf(project))).toBeUndefined();
      await launchHere();
      expect(rowOf()).toMatchObject({ version: "v2", argv1: project.entry });
      expect(freshEntry(specOf(project))).toBeDefined();
    },
  );

  // The last test in this process: the fallback registers the hooks of tsx here. The tests after it start new processes.
  it("records the failure of a build, and runs the source", async () => {
    writeFileSync(project.dep, 'export const VERSION: string = "v3";\n');
    const argv1 = process.argv[1];
    try {
      await launch({ ...specOf(project), esbuild: pathToFileURL(join(project.dir, "no-such-esbuild.mjs")).href });
    } finally {
      process.argv[1] = argv1 ?? "";
    }
    expect(rowOf()).toMatchObject({ version: "v3", argv1: project.entry });
    expect(existsSync(join(project.outDir, "build-error.txt"))).toBe(true);
    expect(freshEntry(specOf(project))).toBeUndefined();
  });
});

interface Ran {
  readonly status: number | null;
  readonly stderr: string;
  readonly row: {
    readonly version: string;
    readonly where: string;
    readonly bundled: boolean;
    readonly url: string;
    readonly dirname: string;
    readonly filename: string;
    readonly name: string;
    readonly argv: string[];
    readonly argv1: string;
  };
}

describe("launch of the built module: a build runs only while each file that it comes from is unchanged", SLOW, () => {
  let project: Project;

  /** This function starts a launcher of the built module in a new process, as `node launch.mjs a --b`. */
  const run = (options: { readonly esbuild?: string } = {}): Ran => {
    const spec = { ...specOf(project), ...options };
    const child = spawnSync(process.execPath, [join(project.dir, "launch.mjs"), "a", "--b"], {
      cwd: project.dir,
      env: { ...process.env, FRESH_SPEC: JSON.stringify(spec) },
      encoding: "utf8",
    });
    return {
      status: child.status,
      stderr: child.stderr,
      row: JSON.parse(child.stdout.trim().split("\n").at(-1) ?? "{}") as Ran["row"],
    };
  };
  const currentMain = (): string => currentOf(project.outDir).main;

  beforeAll(() => {
    project = makeProject();
    writeFileSync(
      join(project.dir, "launch.mjs"),
      `import { launch } from ${JSON.stringify(pathToFileURL(builtModule).href)};\nawait launch(JSON.parse(process.env.FRESH_SPEC));\n`,
    );
  });

  afterAll(() => {
    rmSync(project.dir, { recursive: true, force: true });
  });

  it("builds on the first run, and the entry sees what it sees under tsx", () => {
    const ran = run();
    expect(ran.stderr).toBe("");
    expect(ran.row.version).toBe("v1");
    expect(ran.row.bundled).toBe(true);
    // The file of the package that Node.js resolves for an ES module
    expect(ran.row.where).toBe("esm");
    // The values of the file itself, not of the chunk
    expect(ran.row.url).toBe(pathToFileURL(project.entry).href);
    expect(ran.row.dirname).toBe(dirname(project.entry));
    expect(ran.row.filename).toBe(project.entry);
    expect(ran.row.name).toBe("entry.ts");
    expect(ran.row.argv).toEqual(["a", "--b"]);
    expect(ran.row.argv1).toBe(project.entry);
    expect(ran.status).toBe(3);
    // The package stays outside the bundle, at the file that Node.js resolves it to.
    const bundle = readFileSync(join(project.outDir, currentMain()), "utf8");
    expect(bundle).toContain(pathToFileURL(join(project.dir, "node_modules", "fake-pkg", "esm.js")).href);
  });

  it("runs the same build again while nothing changed", () => {
    const before = currentMain();
    expect(run().row).toMatchObject({ version: "v1", bundled: true });
    expect(currentMain()).toBe(before);
  });

  it("never runs the old build after a source changes: it builds again", () => {
    const before = currentMain();
    writeFileSync(project.dep, 'export const VERSION: string = "v2";\n');
    expect(run().row).toMatchObject({ version: "v2", bundled: true });
    expect(currentMain()).not.toBe(before);
  });

  it("finds an edit that keeps the size and the modification time: it compares the content", () => {
    sameSizeAndTime(project.dep, 'export const VERSION: string = "v9";\n');
    expect(run().row).toMatchObject({ version: "v9", bundled: true });
  });

  it("builds again when an input that is not a source changes (the lockfile)", () => {
    const before = currentMain();
    writeFileSync(project.lock, "lock: 2\n");
    expect(run().row).toMatchObject({ version: "v9", bundled: true });
    expect(currentMain()).not.toBe(before);
  });

  it("runs the source through tsx when no build is possible, and never the old build", () => {
    writeFileSync(project.dep, 'export const VERSION: string = "v3";\n');
    const ran = run({ esbuild: pathToFileURL(join(project.dir, "no-such-esbuild.mjs")).href });
    expect(ran.row).toMatchObject({ version: "v3", where: "esm", bundled: false });
    expect(ran.row.url).toBe(pathToFileURL(project.entry).href);
    expect(ran.row.argv).toEqual(["a", "--b"]);
    expect(ran.row.argv1).toBe(project.entry);
    expect(ran.status).toBe(3);
    expect(readFileSync(join(project.outDir, "build-error.txt"), "utf8")).toContain("no-such-esbuild");
    // When a build is possible again, it is a build of the source as it is now.
    expect(run().row).toMatchObject({ version: "v3", bundled: true });
  });
});
