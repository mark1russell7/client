/**
 * CLI Client Mode
 *
 * Connects to a running CLI server and executes commands remotely.
 * Falls back to local execution if no server is available.
 */

import { readLockfile, isServerAlive } from "./lockfile.js";
import type { AnyProcedure } from "@mark1russell7/client";
import { parseFromSchema, type CLIMeta } from "./parse.js";

interface ClientModeResult {
  success: boolean;
  result?: unknown;
  error?: string;
  /** The onItem callback printed each item already */
  printed?: boolean;
}

/**
 * Try to execute command via running server
 * Returns null if no server available (should fall back to local)
 */
export async function tryClientMode(
  path: string[],
  args: string[],
  options: Record<string, unknown>,
  procedures: AnyProcedure[],
  onItem?: (item: unknown) => void
): Promise<ClientModeResult | null> {
  // Check for running server
  const lockfile = await readLockfile();
  if (!lockfile) {
    return null; // No lockfile, fall back to local
  }

  // Verify server is still alive
  if (!(await isServerAlive(lockfile))) {
    return null; // Server not running, fall back to local
  }

  let client: InstanceType<typeof import("@mark1russell7/client").Client>;
  let method: { service: string; operation: string };
  let input: Record<string, unknown>;
  try {
    // Dynamic import client
    const clientModule = await import("@mark1russell7/client");
    const { Client, HttpTransport } = clientModule;

    // Connect to server
    const transport = new HttpTransport({
      baseUrl: lockfile.endpoint,
    });
    client = new Client({ transport });

    // Find matching procedure to get input schema
    const proc = findProcedure(procedures, path);
    if (!proc) {
      return null; // Unknown procedure, fall back to local
    }

    // Parse input from CLI args
    const meta = (proc.metadata ?? {}) as CLIMeta;
    const parameters = { array: args, options };
    input = parseFromSchema(parameters, meta);

    // Validate input if schema exists
    if (proc.input) {
      input = proc.input.parse(input) as Record<string, unknown>;
    }

    // Convert path to method
    const [service, ...rest] = path;
    method = { service: service!, operation: rest.join(".") };
  } catch {
    // Nothing was sent to the server yet - fall back to local execution
    return null;
  }

  // Execute remotely. From here on, do not fall back to local execution: the server may
  // have run (part of) the command, and running it again would repeat its side effects.
  try {
    // Each item of the response as it arrives (a streaming procedure gives many). The result
    // is the last item.
    let last: { value: unknown } | undefined;
    for await (const item of client.stream(method, input)) {
      last = { value: item };
      onItem?.(item);
    }
    if (!last) {
      throw new Error("No response received from the CLI server");
    }
    return {
      success: true,
      result: last.value,
      printed: onItem !== undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Find a procedure matching the given path
 */
function findProcedure(
  procedures: AnyProcedure[],
  path: string[]
): AnyProcedure | undefined {
  return procedures.find((p) => {
    if (p.path.length !== path.length) return false;
    return p.path.every((seg, i) => seg === path[i]);
  });
}
