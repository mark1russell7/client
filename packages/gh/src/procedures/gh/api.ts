/**
 * gh.api procedure
 *
 * A request to the GitHub API, and its parsed JSON
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcedureContext } from "@procedures/client";
import type { GhApiInput, GhApiOutput } from "../../types.js";
import { fieldArg, ghArg, GhError, runGh } from "./shared.js";

/**
 * This function splits text that has JSON objects and arrays one after the other, as
 * `gh api --paginate` writes one value for each page. It throws for other text.
 */
export function jsonValues(text: string): unknown[] {
  const values: unknown[] = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  let escaped = false;
  for (let at = 0; at < text.length; at++) {
    const char = text[at]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === "{" || char === "[") {
      if (depth === 0) start = at;
      depth++;
    } else if (char === "}" || char === "]") {
      depth--;
      if (depth < 0) throw new Error(`Unexpected "${char}" at ${at}`);
      if (depth === 0) values.push(JSON.parse(text.slice(start, at + 1)));
    } else if (depth === 0) {
      if (!/\s/.test(char)) throw new Error(`Unexpected "${char}" at ${at}`);
    } else if (char === '"') {
      inString = true;
    }
  }
  if (depth !== 0 || inString) throw new Error("The JSON ends too early");
  return values;
}

/**
 * This function reads the output of `gh api`. An empty output (for example HTTP 204) gives
 * null. With `paginate`, the pages of an array become one array, and the pages of an object
 * become an array of the pages.
 */
export function parseGhApiOutput(output: string, paginate = false): unknown {
  const text = output.trim();
  if (text.length === 0) return null;
  let values: unknown[];
  try {
    values = [JSON.parse(text)];
  } catch {
    try {
      if (!paginate) throw new Error("not one JSON value");
      values = jsonValues(text);
    } catch {
      throw new GhError(`gh api gave no JSON: ${text.slice(0, 200)}`, 0, "");
    }
  }
  if (!paginate) return values[0];
  return values.every((value) => Array.isArray(value)) ? values.flat(1) : values;
}

/**
 * This function sends a request to the GitHub API with `gh api` and gives the parsed JSON. It always sends
 * `--method`, because without it gh changes GET to POST when the call has fields. A string field
 * goes as `-f` (gh sends it as text). Another value goes as `-F`, and gh converts its type. A
 * `body` goes to gh as `--input` from a temporary file, which the call removes. A `repo` goes to
 * gh as `GH_REPO`: gh replaces `{owner}` and `{repo}` in the endpoint with it.
 */
export async function ghApi(input: GhApiInput, ctx: ProcedureContext): Promise<GhApiOutput> {
  const args = ["api", ghArg("endpoint", input.endpoint), "--method", input.method ?? "GET"];
  for (const [key, value] of Object.entries(input.fields ?? {})) {
    // -F reads a value that starts with "@" from a file. A number, a boolean and null cannot start with "@".
    if (typeof value === "string") args.push("-f", fieldArg("field", key, value));
    else args.push("-F", fieldArg("field", key, String(value)));
  }
  if (input.paginate) args.push("--paginate");
  const env = input.repo === undefined ? undefined : { GH_REPO: input.repo };

  if (input.body === undefined) {
    return { data: parseGhApiOutput(await runGh(args, input, ctx, env), input.paginate) };
  }
  const folder = await mkdtemp(join(tmpdir(), "procedures-gh-api-"));
  try {
    const file = join(folder, "body.json");
    await writeFile(file, JSON.stringify(input.body), "utf8");
    args.push("--input", file);
    return { data: parseGhApiOutput(await runGh(args, input, ctx, env), input.paginate) };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
