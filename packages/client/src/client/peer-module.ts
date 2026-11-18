/**
 * The module of a running peer over HTTP (d40-tool-surface, step 2): `peerModule` reads the
 * manifest of the peer, and each stub of the module sends its call to the peer.
 *
 * A peer gets a new port or token when it starts again. Thus the address can be a function, for
 * example one that reads the discovery file of the peer. The module reads the address at each call,
 * and it makes a new client when the address changes.
 */

import { Client } from "./client.js";
import { HttpTransport } from "../adapters/http/client/index.js";
import { pathToMethod } from "../server/method.js";
import { MANIFEST_FORMAT, type ProcedureManifest } from "../procedures/manifest.js";
import { forwardedModule, type ForwardOptions } from "../procedures/forward.js";
import type { ProcedureModule } from "../procedures/types.js";

/** The address of a peer: the base URL of its procedures, and its bearer token. */
export interface PeerAddress {
  /** The base URL of the procedures of the peer, for example `http://127.0.0.1:4000/api`. */
  readonly url: string;
  /** The bearer token of the peer. Without it, the requests have no `Authorization` header. */
  readonly token?: string | undefined;
}

/** The options of `peerModule`. */
export interface PeerModuleOptions extends ForwardOptions {
  /** The address of the peer, or a function that reads it. The module reads it at each call. */
  readonly address: PeerAddress | (() => PeerAddress | Promise<PeerAddress>);
  /** The fetch function of the requests. The default is the global `fetch`. */
  readonly fetch?: typeof fetch | undefined;
  /**
   * The signal of the read of the manifest, for example `AbortSignal.timeout(5000)`. An abort makes
   * `peerModule` fail. Each call of a stub takes the signal of its own context.
   */
  readonly signal?: AbortSignal | undefined;
}

/** A function that gives the client of the current address. */
type ClientOf = () => Promise<Client>;

/** This function gives the client of the current address, and keeps it until the address changes. */
function clientsOf(options: PeerModuleOptions): ClientOf {
  let current: { key: string; client: Client } | undefined;
  return async () => {
    const address = typeof options.address === "function" ? await options.address() : options.address;
    const key = JSON.stringify([address.url, address.token ?? null]);
    if (current?.key !== key) {
      const transport = new HttpTransport({
        baseUrl: address.url,
        ...(address.token !== undefined ? { defaultHeaders: { Authorization: `Bearer ${address.token}` } } : {}),
        ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      });
      current = { key, client: new Client({ transport }) };
    }
    return current.client;
  };
}

/** This function tells if a value is a manifest of the format `procedures.manifest/1`. */
function isManifest(value: unknown): value is ProcedureManifest {
  const manifest = value as Partial<ProcedureManifest> | null;
  return typeof manifest === "object" && manifest !== null && manifest.format === MANIFEST_FORMAT && Array.isArray(manifest.procedures);
}

/**
 * This function reads the manifest of a running peer through its procedure `procedure.manifest`, and
 * gives a module with a stub for each entry. Each stub sends its call to the peer. The function
 * fails when the peer does not answer, when `signal` aborts, or when its answer is not a manifest of
 * the format `procedures.manifest/1`. The peer must expose `procedure.manifest`.
 */
export async function peerModule(options: PeerModuleOptions): Promise<ProcedureModule> {
  const clientOf = clientsOf(options);
  const read = options.signal !== undefined ? { signal: options.signal } : undefined;
  const manifest: unknown = await (await clientOf()).call(pathToMethod(["procedure", "manifest"]), {}, read);
  if (!isManifest(manifest)) throw new Error(`the peer of the module ${options.name} gave no manifest of the format ${MANIFEST_FORMAT}`);
  return forwardedModule(
    manifest,
    async (path, input, signal) => (await clientOf()).call(pathToMethod(path), input, signal !== undefined ? { signal } : undefined),
    options,
  );
}
