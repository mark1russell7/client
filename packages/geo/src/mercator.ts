/**
 * Web Mercator, the projection of the slippy maps (OpenStreetMap and the others): the pixel of a
 * point at a zoom level, the zoom that fits points into a box, and the 256-pixel tiles that cover a
 * view. The functions are pure and need no network, so a browser bundle can use them.
 */

/** The size of a map tile, in pixels. */
export const TILE_SIZE = 256;

/** A position on the world map at one zoom level, in pixels from the top left corner. */
export interface Pixel {
  readonly x: number;
  readonly y: number;
}

/** This function gives the pixel of a point (degrees) at a zoom level. */
export const project = (lat: number, lon: number, zoom: number): Pixel => {
  const scale = TILE_SIZE * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
};

/** The options of `fitZoom`. */
export interface FitZoomOptions {
  /** The deepest zoom to try (default 17). */
  readonly deepest?: number;
  /** The part of the box that the points can use (default 0.85: a margin of 15 %). */
  readonly margin?: number;
  /** The zoom for one point or none, which have no extent (default 14). */
  readonly single?: number;
}

/**
 * This function gives the deepest zoom at which all the points fit in a box of `width` by
 * `height` pixels, with a margin. It tries each zoom from `deepest` down, and gives 1 when none fits.
 */
export const fitZoom = (
  points: ReadonlyArray<{ readonly lat: number; readonly lon: number }>,
  width: number,
  height: number,
  options: FitZoomOptions = {}
): number => {
  if (points.length <= 1) return options.single ?? 14;
  const margin = options.margin ?? 0.85;
  for (let zoom = options.deepest ?? 17; zoom > 1; zoom -= 1) {
    const pixels = points.map((point) => project(point.lat, point.lon, zoom));
    const xs = pixels.map((pixel) => pixel.x);
    const ys = pixels.map((pixel) => pixel.y);
    if (Math.max(...xs) - Math.min(...xs) <= width * margin && Math.max(...ys) - Math.min(...ys) <= height * margin) {
      return zoom;
    }
  }
  return 1;
};

/** A tile of a view: its tile numbers (`x` wraps around the world) and its place in the view. */
export interface ViewTile {
  readonly x: number;
  readonly y: number;
  readonly left: number;
  readonly top: number;
}

/**
 * This function gives the tiles that a view of `width` by `height` pixels needs, when the top left
 * corner of the view is at `topLeft`. Each tile has its tile numbers and its position in the view.
 * The tiles above and below the world are left out.
 */
export const tilesFor = (topLeft: Pixel, width: number, height: number, zoom: number): ViewTile[] => {
  const count = 2 ** zoom;
  const out: ViewTile[] = [];
  for (let tx = Math.floor(topLeft.x / TILE_SIZE); tx * TILE_SIZE < topLeft.x + width; tx += 1) {
    for (let ty = Math.floor(topLeft.y / TILE_SIZE); ty * TILE_SIZE < topLeft.y + height; ty += 1) {
      if (ty < 0 || ty >= count) continue;
      out.push({
        x: ((tx % count) + count) % count,
        y: ty,
        left: tx * TILE_SIZE - topLeft.x,
        top: ty * TILE_SIZE - topLeft.y,
      });
    }
  }
  return out;
};
