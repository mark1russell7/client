import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cachedTile, isTile, OSM_TILES, tileUrl, type FetchBytes } from "./tiles.js";

let dir: string | undefined;

afterEach(async () => {
  if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

/** A tile server that answers with `body`, and the requests that it got. */
const server = (body: Uint8Array, status = 200): { fetch: FetchBytes; asked: Array<{ url: string; agent: string | undefined }> } => {
  const asked: Array<{ url: string; agent: string | undefined }> = [];
  const fetch: FetchBytes = async (url, init) => {
    asked.push({ url, agent: init.headers["user-agent"] });
    return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => body.slice().buffer };
  };
  return { fetch, asked };
};

describe("isTile and tileUrl", () => {
  it("accepts the tiles of a zoom level and refuses the others", () => {
    expect(isTile({ z: 0, x: 0, y: 0 })).toBe(true);
    expect(isTile({ z: 3, x: 7, y: 7 })).toBe(true);
    expect(isTile({ z: 19, x: 524_287, y: 0 })).toBe(true);
    expect(isTile({ z: 3, x: 8, y: 0 })).toBe(false);
    expect(isTile({ z: 3, x: 0, y: -1 })).toBe(false);
    expect(isTile({ z: 20, x: 0, y: 0 })).toBe(false);
    expect(isTile({ z: 20, x: 0, y: 0 }, 22)).toBe(true);
    expect(isTile({ z: 2.5, x: 0, y: 0 })).toBe(false);
    expect(isTile({ z: 1, x: Number.NaN, y: 0 })).toBe(false);
  });

  it("fills the address of a tile", () => {
    expect(tileUrl(OSM_TILES, { z: 12, x: 1205, y: 1539 })).toBe("https://tile.openstreetmap.org/12/1205/1539.png");
  });
});

describe("cachedTile", () => {
  it("gets a tile one time with the User-Agent, keeps it, and gives the kept file after that", async () => {
    dir = await mkdtemp(join(tmpdir(), "geo-tiles-"));
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const tiles = server(png);
    const options = { dir, userAgent: "geo-test/1.0 (a test)", fetch: tiles.fetch };
    expect(await cachedTile({ z: 5, x: 9, y: 11 }, options)).toEqual(png);
    expect(await cachedTile({ z: 5, x: 9, y: 11 }, options)).toEqual(png);
    expect(tiles.asked).toEqual([{ url: "https://tile.openstreetmap.org/5/9/11.png", agent: "geo-test/1.0 (a test)" }]);
    expect(new Uint8Array(await readFile(join(dir, "5", "9", "11.png")))).toEqual(png);
    expect(await readdir(join(dir, "5", "9"))).toEqual(["11.png"]);
  });

  it("uses the source and the extension of its options", async () => {
    dir = await mkdtemp(join(tmpdir(), "geo-tiles-"));
    const tiles = server(new Uint8Array([1]));
    await cachedTile({ z: 1, x: 1, y: 0 }, { dir, userAgent: "a", source: "https://tiles.example.com/{z}/{x}/{y}.jpg", extension: "jpg", fetch: tiles.fetch });
    expect(tiles.asked[0]?.url).toBe("https://tiles.example.com/1/1/0.jpg");
    expect(await readdir(join(dir, "1", "1"))).toEqual(["0.jpg"]);
  });

  it("keeps nothing after an HTTP error or a body that is too large", async () => {
    dir = await mkdtemp(join(tmpdir(), "geo-tiles-"));
    await expect(cachedTile({ z: 2, x: 1, y: 1 }, { dir, userAgent: "a", fetch: server(new Uint8Array([1]), 429).fetch })).rejects.toThrow(/HTTP 429/);
    await expect(cachedTile({ z: 2, x: 1, y: 1 }, { dir, userAgent: "a", maxBytes: 4, fetch: server(new Uint8Array(5)).fetch })).rejects.toThrow(/more than a tile/);
    expect(await readdir(dir)).toEqual([]);
  });

  it("reports a request that fails, and refuses a tile that does not exist", async () => {
    dir = await mkdtemp(join(tmpdir(), "geo-tiles-"));
    const down: FetchBytes = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(cachedTile({ z: 2, x: 1, y: 1 }, { dir, userAgent: "a", fetch: down })).rejects.toThrow(/did not answer.*the request failed/);
    await expect(cachedTile({ z: 2, x: 4, y: 0 }, { dir, userAgent: "a", fetch: down })).rejects.toThrow(RangeError);
  });
});
