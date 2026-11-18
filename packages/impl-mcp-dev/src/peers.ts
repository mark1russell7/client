/**
 * The running peers of `MCP_PEERS` (d40-tool-surface, step 2).
 *
 * A peer with a state, for example a daemon, keeps its procedures in its own process. The host does
 * not load a second copy of them. It reads the manifest of each peer with `peerModule` of
 * `@procedures/client`, and each tool of the peer sends its call to the peer. The peer examines the
 * input with its own schemas and applies its own policy.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { peerModule, type PeerAddress, type ProcedureModule } from "@procedures/client";
import { errorMessage } from "@mark1russell7/text";
import type { PeerConfig } from "./config.js";

/** The time limit of the read of the manifest of a peer at the start of the host. */
export const DEFAULT_PEER_TIMEOUT_MS = 5_000;

/** The result of one peer at the start: its count of forwarded procedures, or the reason that it gives none. */
export type PeerState =
  | { readonly name: string; readonly source: string; readonly procedures: number }
  | { readonly name: string; readonly source: string; readonly error: string };

/** The modules and the states of the peers. */
export interface LoadedPeers {
  readonly modules: ProcedureModule[];
  readonly states: PeerState[];
}

/** The options of `loadPeers`. */
export interface LoadPeersOptions {
  /** The time limit of the read of each manifest, in milliseconds. The default is `DEFAULT_PEER_TIMEOUT_MS`. */
  readonly timeoutMs?: number | undefined;
  /** The fetch function of the requests. The default is the global `fetch`. */
  readonly fetch?: typeof fetch | undefined;
  /** The folder of a relative path of a discovery file. The default is the folder of the process. */
  readonly cwd?: string | undefined;
}

/** This function tells if a text is an HTTP or HTTPS URL. */
function isHttpUrl(text: string): boolean {
  return /^https?:\/\//i.test(text);
}

/**
 * This function reads a discovery file. The file is a JSON object with the base URL of the procedures
 * in `url` or `endpoint`, and an optional bearer token in `token`. A running peer writes the file. It
 * writes a new port and a new token when it starts again.
 */
export async function readDiscovery(file: string): Promise<PeerAddress> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    throw new Error(`the discovery file ${file} does not open (is the peer running?): ${errorMessage(error)}`, { cause: error });
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`the discovery file ${file} is not JSON`, { cause: error });
  }
  const record = (typeof value === "object" && value !== null ? value : {}) as { url?: unknown; endpoint?: unknown; token?: unknown };
  const url = typeof record.url === "string" ? record.url : record.endpoint;
  if (typeof url !== "string" || !isHttpUrl(url)) throw new Error(`the discovery file ${file} has no HTTP URL in "url" or "endpoint"`);
  if (record.token !== undefined && typeof record.token !== "string") throw new Error(`the token of the discovery file ${file} is not a text`);
  return { url, ...(typeof record.token === "string" ? { token: record.token } : {}) };
}

/**
 * This function gives the address of a peer. A URL is the address. For a discovery file, it gives a
 * function that reads the file at each call, so the calls follow the peer after it starts again.
 */
export function peerAddress(source: string, cwd: string = process.cwd()): PeerAddress | (() => Promise<PeerAddress>) {
  if (isHttpUrl(source)) return { url: source };
  const file = source.startsWith("file:") ? fileURLToPath(source) : resolve(cwd, source);
  return () => readDiscovery(file);
}

/**
 * This function reads the manifest of each peer, all at one time. A peer that does not answer in
 * the time limit gives no module, and its state tells why. Thus the other tools of the host stay available.
 */
export async function loadPeers(peers: readonly PeerConfig[], options: LoadPeersOptions = {}): Promise<LoadedPeers> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PEER_TIMEOUT_MS;
  const results = await Promise.all(
    peers.map(async (peer) => {
      try {
        const module = await peerModule({
          name: `peer:${peer.name}`,
          address: peerAddress(peer.source, options.cwd),
          signal: AbortSignal.timeout(timeoutMs),
          ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
        });
        return { peer, module };
      } catch (error) {
        return { peer, error: errorMessage(error) };
      }
    }),
  );
  const loaded: LoadedPeers = { modules: [], states: [] };
  for (const result of results) {
    if (result.module === undefined) {
      loaded.states.push({ name: result.peer.name, source: result.peer.source, error: result.error ?? "no module" });
      continue;
    }
    loaded.modules.push(result.module);
    loaded.states.push({ name: result.peer.name, source: result.peer.source, procedures: result.module.procedures.length });
  }
  return loaded;
}
