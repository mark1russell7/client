import { describe, expect, it } from "vitest";
import { hasFeature, resolveFeatures } from "./shared.js";
import type { FeaturesManifest } from "./types.js";

/** The local copy before the move to `@mark1russell7/cue/core`, kept as a fixture. */
function oldResolveFeatures(requested: string[], manifest: FeaturesManifest): string[] {
  const resolved = new Set<string>();
  const queue = [...requested];
  while (queue.length > 0) {
    const feature = queue.shift()!;
    if (resolved.has(feature)) continue;
    if (!hasFeature(manifest, feature)) continue;
    const featureDef = manifest.features[feature]!;
    resolved.add(feature);
    for (const dep of featureDef.dependencies) {
      if (!resolved.has(dep)) queue.push(dep);
    }
  }
  return Array.from(resolved);
}

const manifest = (deps: Record<string, string[]>): FeaturesManifest =>
  ({ features: Object.fromEntries(Object.entries(deps).map(([name, dependencies]) => [name, { dependencies }])) }) as unknown as FeaturesManifest;

const MANIFESTS: Record<string, FeaturesManifest> = {
  empty: manifest({}),
  chain: manifest({ a: ["b"], b: ["c"], c: [] }),
  diamond: manifest({ top: ["left", "right"], left: ["base"], right: ["base"], base: [] }),
  wide: manifest({ r: ["z", "y", "x"], x: ["w"], y: ["w", "v"], z: [], w: [], v: [] }),
  cycle: manifest({ a: ["b"], b: ["c"], c: ["a"] }),
  self: manifest({ a: ["a", "b"], b: [] }),
  unknownDep: manifest({ a: ["missing", "b"], b: ["gone"] }),
  layered: manifest({ react: ["vite", "ts"], vite: ["node", "ts"], ts: [], node: ["ts"], lib: ["ts", "node"] }),
};

const REQUESTS: string[][] = [
  [], ["a"], ["b", "a"], ["top"], ["right", "top"], ["r"], ["y", "r"], ["c"], ["missing"], ["a", "a"],
  ["react"], ["lib", "react"], ["node", "vite", "react"], ["constructor", "toString", "a"], ["__proto__", "react"],
];

describe("resolveFeatures from @mark1russell7/cue/core", () => {
  it("gives the same features in the same order as the local copy before the move", () => {
    let cases = 0;
    for (const [name, m] of Object.entries(MANIFESTS)) {
      for (const requested of REQUESTS) {
        expect(resolveFeatures([...requested], m), `${name} ${JSON.stringify(requested)}`).toEqual(oldResolveFeatures([...requested], m));
        cases++;
      }
    }
    expect(cases).toBe(Object.keys(MANIFESTS).length * REQUESTS.length);
  });

  it("gives the requested features first, then their dependencies breadth first", () => {
    expect(resolveFeatures(["react"], MANIFESTS["layered"]!)).toEqual(["react", "vite", "ts", "node"]);
    expect(resolveFeatures(["top"], MANIFESTS["diamond"]!)).toEqual(["top", "left", "right", "base"]);
  });
});
