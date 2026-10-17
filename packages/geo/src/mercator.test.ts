import { describe, expect, it } from "vitest";
import { TILE_SIZE, fitZoom, project, tilesFor } from "./mercator.js";

describe("Web Mercator", () => {
  it("puts the point 0, 0 in the middle of the world, and the antimeridian at the edge", () => {
    expect(project(0, 0, 0)).toEqual({ x: 128, y: 128 });
    expect(project(0, 180, 1).x).toBe(2 * TILE_SIZE);
    expect(project(0, -180, 3).x).toBe(0);
  });

  it("moves north up (a smaller y) and doubles the pixels at each zoom", () => {
    const low = project(10, 20, 4);
    const high = project(40, 20, 4);
    expect(high.y).toBeLessThan(low.y);
    const twice = project(10, 20, 5);
    expect(twice.x).toBeCloseTo(low.x * 2, 9);
    expect(twice.y).toBeCloseTo(low.y * 2, 9);
  });

  it("fits the points into the box with a margin, at the deepest zoom that holds them", () => {
    const points = [
      { lat: 42.36, lon: -71.06 },
      { lat: 42.66, lon: -70.62 },
    ];
    const zoom = fitZoom(points, 800, 600);
    const fits = (z: number): boolean => {
      const [a, b] = points.map((point) => project(point.lat, point.lon, z));
      return Math.abs(a!.x - b!.x) <= 800 * 0.85 && Math.abs(a!.y - b!.y) <= 600 * 0.85;
    };
    expect(fits(zoom)).toBe(true);
    expect(fits(zoom + 1)).toBe(false);
    expect(fitZoom(points, 800, 600, { deepest: 5 })).toBe(5);
  });

  it("gives the single zoom for one point or none, and 1 when nothing fits", () => {
    expect(fitZoom([{ lat: 1, lon: 1 }], 100, 100)).toBe(14);
    expect(fitZoom([], 100, 100, { single: 12 })).toBe(12);
    expect(fitZoom([{ lat: -80, lon: -170 }, { lat: 80, lon: 170 }], 10, 10)).toBe(1);
  });

  it("lists the tiles of a view, wraps x around the world and leaves out the rows outside it", () => {
    const tiles = tilesFor({ x: -100, y: -50 }, 300, 300, 1);
    expect(tiles).toContainEqual({ x: 1, y: 0, left: -156, top: 50 });
    expect(tiles).toContainEqual({ x: 0, y: 0, left: 100, top: 50 });
    expect(tiles.every((tile) => tile.y >= 0 && tile.y < 2)).toBe(true);
    expect(tilesFor({ x: 0, y: 0 }, 256, 256, 0)).toEqual([{ x: 0, y: 0, left: 0, top: 0 }]);
  });
});
