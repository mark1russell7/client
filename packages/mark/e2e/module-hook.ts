/**
 * This module records the URL of each module that a process loads (roadmap O93). The gate test
 * `lazy.e2e.test.ts` loads it with `--import` into a run of the built `mark`. At the exit of the
 * process, the module writes the list as JSON to the file that `MARK_MODULE_RECORD` names.
 *
 * The hook is synchronous and runs in the thread of the process (`registerHooks`). It sees the
 * modules of `import` and of `require()`.
 */

import { writeFileSync } from "node:fs";
import { registerHooks } from "node:module";

const loaded = new Set<string>();

registerHooks({
  load(url, context, nextLoad) {
    loaded.add(url);
    return nextLoad(url, context);
  },
});

process.on("exit", () => {
  const out = process.env.MARK_MODULE_RECORD;
  if (out !== undefined && out !== "") writeFileSync(out, JSON.stringify([...loaded]));
});
