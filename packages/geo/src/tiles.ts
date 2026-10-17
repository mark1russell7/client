/**
 * Map tiles on disk, the Node entry `@procedures/geo/tiles`. The root of the package stays
 * browser-safe, so the functions that read and write files are here.
 *
 * A slippy map asks for many tiles in each view. The policy of the OpenStreetMap tile servers
 * asks each client for a real `User-Agent` and for a cache. `cachedTile` gets a tile from the
 * server one time, keeps it in a folder, and gives the kept file after that. An area that was
 * shown one time works without the network.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** A tile of a slippy map: the zoom level, the column and the row. */
export interface Tile {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** The address of the standard tiles of OpenStreetMap. `{z}`, `{x}` and `{y}` are filled in. */
export const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** The fetch that `cachedTile` uses. A test or a host gives its own with the option `fetch`. */
export type FetchBytes = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

/** The options of `cachedTile`. */
export interface CachedTileOptions {
  /** The folder of the kept tiles. A tile is kept as `<dir>/<z>/<x>/<y>.<extension>`. */
  readonly dir: string;
  /** The `User-Agent` of the requests. The policy of the tile server asks for a real one. */
  readonly userAgent: string;
  /** The address of a tile, with `{z}`, `{x}` and `{y}`. The default is `OSM_TILES`. */
  readonly source?: string | undefined;
  /** The extension of the kept files. The default is `png`. */
  readonly extension?: string | undefined;
  /** The time limit of a request, in milliseconds. The default is 20 000. */
  readonly timeoutMs?: number | undefined;
  /** The largest tile, in bytes. A larger body is not a tile. The default is 2 MiB. */
  readonly maxBytes?: number | undefined;
  /** This option replaces the global `fetch`. */
  readonly fetch?: FetchBytes | undefined;
}

/**
 * This function tells if a tile exists at its zoom level: the three numbers are integers, the zoom
 * is from 0 to `maxZoom`, and the column and the row are from 0 to 2^z - 1.
 */
export function isTile(tile: Tile, maxZoom = 19): boolean {
  const { z, x, y } = tile;
  if (!Number.isSafeInteger(z) || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return false;
  if (z < 0 || z > maxZoom) return false;
  const size = 2 ** z;
  return x >= 0 && y >= 0 && x < size && y < size;
}

/** This function fills `{z}`, `{x}` and `{y}` of a tile address. */
export function tileUrl(template: string, tile: Tile): string {
  return template.replace("{z}", String(tile.z)).replace("{x}", String(tile.x)).replace("{y}", String(tile.y));
}

let written = 0;

/**
 * This function gives the bytes of a tile. It reads the kept file when there is one. Otherwise it
 * gets the tile from the server, keeps it, and gives it.
 *
 * - A tile that does not exist (`isTile` with zoom 30) throws a `RangeError`.
 * - An HTTP error, no answer in the time limit, or a body larger than `maxBytes` throws an `Error`.
 *   Then the function keeps nothing.
 * - The file is written to a temporary name first, then renamed. A stop during the write never
 *   leaves a part of a tile.
 */
export async function cachedTile(tile: Tile, options: CachedTileOptions): Promise<Uint8Array> {
  if (!isTile(tile, 30)) throw new RangeError(`cachedTile: ${JSON.stringify(tile)} is not a tile`);
  const file = join(options.dir, String(tile.z), String(tile.x), `${String(tile.y)}.${options.extension ?? "png"}`);
  try {
    return new Uint8Array(await readFile(file));
  } catch {
    // Not kept yet: get it one time
  }
  const url = tileUrl(options.source ?? OSM_TILES, tile);
  const timeoutMs = options.timeoutMs ?? 20_000;
  const fetchBytes: FetchBytes = options.fetch ?? fetch;
  let response: Awaited<ReturnType<FetchBytes>>;
  try {
    response = await fetchBytes(url, { headers: { "user-agent": options.userAgent }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = (error as { name?: string }).name === "TimeoutError" ? `no answer in ${String(timeoutMs)} ms` : "the request failed";
    throw new Error(`The tile server did not answer for ${url}: ${reason}`);
  }
  if (!response.ok) throw new Error(`The tile server gave HTTP ${String(response.status)} for ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  if (bytes.byteLength > maxBytes) throw new Error(`The body for ${url} has ${String(bytes.byteLength)} bytes, more than a tile (${String(maxBytes)})`);
  await mkdir(dirname(file), { recursive: true });
  written += 1;
  const temporary = `${file}.${String(process.pid)}-${String(written)}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, file);
  return bytes;
}
