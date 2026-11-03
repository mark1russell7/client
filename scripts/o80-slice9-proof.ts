// TEMPORARY, roadmap O80 slice 9. A later commit of the same pull request removes this script and
// its CI step. The pull request body keeps the result.
//
// The script starts the JavaScript and the TypeScript form of two scripts on the same working
// tree. For each case, it compares the exit codes and the merged standard output and standard
// error, line by line. The cases change the tree (a missing file, a bad manifest, a broken bin), so
// each failure path of the scripts runs, and each case names the text that its log must have. A
// case that does not reach its failure path thus fails the proof.
//
// Before the compare, three texts change, in both logs: the random temporary folder, the time of
// --before, and the name of use-npm-general-packages (each form names itself or the other form).
//
// Start it in CI after pnpm build: node scripts/o80-slice9-proof.ts

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { root } from "./lib/workspace.mjs";

/** The fields of a manifest that the cases change. */
interface EditableManifest {
  version?: string;
  homepage?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports?: Record<string, Record<string, string>>;
}

/** One start of both forms of a script. */
interface ProofCase {
  readonly name: string;
  readonly forms: readonly [string, string];
  readonly args: readonly string[];
  readonly exitCode: number;
  /** The texts that the log must have. */
  readonly expect: readonly string[];
  /** The change to the tree before each form starts. The tree comes back after each form. */
  readonly arrange?: () => void;
}

const logs = mkdtempSync(join(tmpdir(), "o80-proof-"));
const summary: string[] = ["| case | exit codes | lines | compared lines that differ | expected texts |", "| --- | --- | --- | --- | --- |"];
let broken = false;

const editManifest = (path: string, edit: (manifest: EditableManifest) => void): void => {
  const file = join(root, path);
  const manifest = JSON.parse(readFileSync(file, "utf8")) as EditableManifest;
  edit(manifest);
  writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
};

const restoreTree = (): void => {
  execFileSync("git", ["checkout", "--", "."], { cwd: root });
};

const normalize = (text: string): string =>
  text
    .replace(/client-pack-[A-Za-z0-9]{6}/g, "client-pack-TEMP")
    .replace(/--before=\S+/g, "--before=TIME")
    .replace(/use-npm-general-packages\.(?:old\.mjs|mjs|ts)/g, "use-npm-general-packages.SCRIPT");

/** Starts one form, with both output streams on one file, as `2>&1` does. */
const start = (form: string, args: readonly string[], log: string): number => {
  const fd = openSync(log, "w");
  const { status } = spawnSync(process.execPath, [form, ...args], { cwd: root, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  return status ?? -1;
};

const prove = (proofCase: ProofCase): void => {
  const { name, forms, args, exitCode, expect, arrange } = proofCase;
  const results = forms.map((form, index) => {
    arrange?.();
    const log = join(logs, `${name}-${index}.log`);
    const code = start(form, args, log);
    const tree = execFileSync("git", ["diff"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
    restoreTree();
    return { code, tree, text: readFileSync(log, "utf8") };
  });
  const [first, second] = results;
  if (first === undefined || second === undefined) throw new Error("a case has two forms");

  const a = normalize(first.text).split("\n");
  const b = normalize(second.text).split("\n");
  const differ: string[] = [];
  for (let line = 0; line < Math.max(a.length, b.length); line++) {
    if (a[line] !== b[line]) differ.push(`line ${line + 1}:\n  ${forms[0]}: ${a[line]}\n  ${forms[1]}: ${b[line]}`);
  }
  const missing = expect.filter((text) => !first.text.includes(text) || !second.text.includes(text));
  const treesAgree = normalize(first.tree) === normalize(second.tree);
  const good = first.code === exitCode && second.code === exitCode && differ.length === 0 && missing.length === 0 && treesAgree;
  if (!good) broken = true;

  console.log(`::group::${good ? "same" : "DIFFERENT"}: ${name}: ${forms.join(" and ")} ${args.join(" ")}`);
  console.log(`exit codes ${first.code} and ${second.code} (expected ${exitCode}), ${a.length} and ${b.length} lines, ${differ.length} differ, the trees ${treesAgree ? "agree" : "differ"}`);
  if (missing.length > 0) console.log(`missing texts: ${JSON.stringify(missing)}`);
  for (const difference of differ.slice(0, 20)) console.log(difference);
  console.log(`--- the log of ${forms[1]}`);
  console.log(second.text);
  console.log("::endgroup::");
  summary.push(`| ${name} | ${first.code}, ${second.code} | ${a.length}, ${b.length} | ${differ.length} | ${expect.length - missing.length} of ${expect.length} |`);
};

const CHECK = ["scripts/check-packages.mjs", "scripts/check-packages.ts"] as const;
const OLD_USE_NPM = "scripts/use-npm-general-packages.old.mjs";
const USE_NPM = [OLD_USE_NPM, "scripts/use-npm-general-packages.ts"] as const;

/** Each failure that a bad package gives before the install. */
const arrangeFailures = (): void => {
  const changeset = join(root, ".changeset", "config.json");
  const config = JSON.parse(readFileSync(changeset, "utf8")) as { fixed: string[][] };
  const group = config.fixed[0] ?? [];
  config.fixed[0] = [...group.filter((name) => name !== "@procedures/dag"), "@procedures/not-a-package"];
  writeFileSync(changeset, JSON.stringify(config, null, 2) + "\n");
  // pnpm pack copies the LICENSE of the workspace root into a package that has none.
  rmSync(join(root, "LICENSE"));
  rmSync(join(root, "packages", "client-fs", "LICENSE"));
  rmSync(join(root, "packages", "client-fs", "README.md"));
  editManifest("packages/client-fs/package.json", (manifest) => {
    delete manifest.homepage;
    manifest.version = "9.9.9";
  });
  editManifest("packages/client-git/package.json", (manifest) => {
    manifest.dependencies = { ...manifest.dependencies, "@mark1russell7/cue": "github:mark1russell7/cue#main" };
  });
  const index = join(root, "packages", "client-shell", "src", "index.ts");
  writeFileSync(index, `${readFileSync(index, "utf8")}\nimport "./register.js";\n`);
  editManifest("packages/client-dag/package.json", (manifest) => {
    const entry = manifest.exports?.["."];
    if (entry !== undefined) entry.types = "./dist/not-a-file.d.ts";
  });
};

/** A git dependency alone: --allow-git-deps accepts it. */
const arrangeGitDependency = (): void => {
  editManifest("packages/client-git/package.json", (manifest) => {
    manifest.dependencies = { ...manifest.dependencies, "@mark1russell7/cue": "github:mark1russell7/cue#main" };
  });
};

/** The specifiers and the build approval that use-npm-general-packages replaces. */
const arrangeSpecifiers = (): void => {
  editManifest("package.json", (manifest) => {
    manifest.devDependencies = { ...manifest.devDependencies, "@mark1russell7/cue": "github:mark1russell7/cue#main" };
  });
  editManifest("packages/client-dag/package.json", (manifest) => {
    manifest.dependencies = { ...manifest.dependencies, "@mark1russell7/splay": "git+https://github.com/mark1russell7/splay.git" };
    manifest.peerDependencies = { ...manifest.peerDependencies, "@mark1russell7/docker-sqlite": "github:mark1russell7/docker-sqlite" };
  });
  const yaml = join(root, "pnpm-workspace.yaml");
  writeFileSync(
    yaml,
    readFileSync(yaml, "utf8").replace(
      "allowBuilds:\n",
      'allowBuilds:\n  # The build approval of the git URL of cue\n  "@mark1russell7/cue@git+https://github.com/mark1russell7/cue.git": true\n',
    ),
  );
};

/** A built bin that fails on --help. The file is not tracked, so the case restores it itself. */
const proveBrokenBin = (): void => {
  const bin = join(root, "packages", "mark", "dist", "bin.js");
  const original = readFileSync(bin, "utf8");
  const shebang = original.startsWith("#!") ? original.slice(0, original.indexOf("\n") + 1) : "";
  writeFileSync(bin, `${shebang}console.error("the bin refused");\nprocess.exit(3);\n${original.slice(shebang.length)}`);
  try {
    prove({ name: "broken-bin", forms: CHECK, args: [], exitCode: 1, expect: ["  FAIL @procedures/mark: mark --help", "the bin refused", "The package check found 1 problems."] });
  } finally {
    writeFileSync(bin, original);
  }
};

try {
  writeFileSync(join(root, OLD_USE_NPM), execFileSync("git", ["show", "HEAD^1:scripts/use-npm-general-packages.mjs"], { cwd: root, encoding: "utf8" }));

  prove({ name: "pass", forms: CHECK, args: [], exitCode: 0, expect: ["Installing the tarballs into an empty project", "  ok   mark --help", "The package check passed."] });
  prove({
    name: "failures",
    forms: CHECK,
    args: [],
    exitCode: 1,
    expect: [
      "the public packages have more than one version",
      '@procedures/dag is not in the "fixed" group',
      ".changeset/config.json names @procedures/not-a-package",
      "is a git dependency. Publish the general package",
      "the packed package.json has no homepage",
      "src/index.ts imports ./register.js",
      "the tarball has no LICENSE",
      "the tarball has no README.md",
      "@procedures/dag: publint",
      "but the file does not exist.",
      "@procedures/dag: attw",
      "Used fallback condition",
      "The package check found",
    ],
    arrange: arrangeFailures,
  });
  prove({
    name: "allow-git-deps",
    forms: CHECK,
    args: ["--allow-git-deps", "--no-install", "--keep"],
    exitCode: 0,
    expect: ["The temporary folder: ", "The package check passed."],
    arrange: arrangeGitDependency,
  });
  proveBrokenBin();

  const replaced = ["packages/client-dag/package.json: dependencies.@mark1russell7/splay", "package.json: devDependencies.@mark1russell7/cue", "pnpm-workspace.yaml: removes"];
  prove({ name: "use-npm-dry-run", forms: USE_NPM, args: ["--dry-run", "--force"], exitCode: 0, expect: [...replaced, "2 package.json files would change."], arrange: arrangeSpecifiers });
  prove({ name: "use-npm-write", forms: USE_NPM, args: ["--force", "--no-install"], exitCode: 0, expect: [...replaced, "2 package.json files changed."], arrange: arrangeSpecifiers });
  prove({ name: "use-npm-registry", forms: USE_NPM, args: ["--dry-run"], exitCode: 0, expect: ["@mark1russell7/cue@^1.0.0: on npm"], arrange: arrangeSpecifiers });
} finally {
  rmSync(join(root, OLD_USE_NPM), { force: true });
}

const table = summary.join("\n");
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
if (broken) {
  console.error("The forms differ.");
  process.exit(1);
}
console.log("The forms give the same result in each case.");
