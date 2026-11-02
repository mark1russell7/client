/**
 * This module records each module that a process loads, and the bytes of its source (O90). The
 * script `setup-profile.ts` loads it with `--import` into the setup child. At the exit of the
 * process, the module writes the list as JSON to the file that `SETUP_PROFILE_MODULES` names.
 *
 * The hook is synchronous and runs in the thread of the process (`registerHooks`). It records only
 * the bytes: the time of each module comes from the CPU profile.
 */

import { writeFileSync } from "node:fs";
import { registerHooks } from "node:module";

const loaded: { url: string; bytes: number }[] = [];

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    const source = result.source;
    const bytes = source === undefined || source === null ? 0 : typeof source === "string" ? Buffer.byteLength(source) : source.byteLength;
    loaded.push({ url, bytes });
    return result;
  },
});

process.on("exit", () => {
  const out = process.env.SETUP_PROFILE_MODULES;
  if (out !== undefined && out !== "") writeFileSync(out, JSON.stringify(loaded));
});
