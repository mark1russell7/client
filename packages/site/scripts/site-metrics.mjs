// The measured numbers of the home page, made at build time:
// - the tests of the repository: each `it("…")` and `test("…")` in the test files of the packages;
// - the npm state of the library: the install command of the home page names npm only when
//   @procedures/client is on the registry (else it shows the clone of the repository).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|js|mjs)$/;
// A test, not a suite: `it("…"`, `test("…"`, `it.skip("…"`, `test.concurrent("…"`
const TEST_CALL = /(?:^|[^\w.$])(?:it|test)(?:\.(?:skip|only|concurrent|fails|todo|sequential))?\s*\(\s*[`'"]/g;

function testFiles(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(path, found);
    else if (TEST_FILE.test(entry.name)) found.push(path);
  }
  return found;
}

/** The count of the tests and of the test files in the packages folder. */
export function countTests(packagesDir) {
  let tests = 0;
  let files = 0;
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    for (const file of testFiles(join(packagesDir, pkg.name))) {
      files++;
      tests += (readFileSync(file, "utf8").match(TEST_CALL) ?? []).length;
    }
  }
  return { tests, files };
}

/**
 * The latest version of a package on npm, or null when it is not there or the registry does not
 * answer in time (an offline build).
 */
export async function npmVersion(name, timeoutMs = 4000) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${name.replace(/\//g, "%2f")}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.["dist-tags"]?.latest === "string" ? data["dist-tags"].latest : null;
  } catch {
    return null;
  }
}
