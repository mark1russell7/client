/**
 * The tool surface of the assistant bundle (roadmap R48). The list of tools is what Claude can
 * call when a host opts in, so this test pins it: change it only on purpose.
 */

import { describe, expect, it, vi } from "vitest";
import { createRegistry, effectsOf, invokePath, outputValue, registerModules, surfaceRule } from "@procedures/client";
import { createHostFetch, isHostNotAllowed } from "@procedures/http";
import geoModule, { createGeoModule } from "@procedures/geo/module";
import icsModule, { createIcsModule } from "@procedures/ics/module";
import { createWeatherModule } from "@procedures/weather/module";
import { GEO_PRIVATE_HOST_NOTICE, ICS_PRIVATE_HOST_NOTICE, bundleAssistantModule, mcpExclude, mcpHostModules, mcpNamespaces } from "./module.js";

const TOOLS = [
  "exif.read",
  "geo.distance",
  "geo.geocode",
  "geo.geohash",
  "geo.route",
  "ics.occurrences",
  "ics.parse",
  "ics.write",
  "mail.parse",
  "weather.forecast",
];

describe("bundle-assistant", () => {
  const registry = createRegistry(bundleAssistantModule);
  const exposed = surfaceRule({ namespaces: mcpNamespaces, exclude: mcpExclude });
  const tools = registry
    .getAll()
    .filter((procedure) => procedure.handler && exposed(procedure.path))
    .map((procedure) => procedure.path.join("."))
    .sort();

  it("gives exactly the pinned tools", () => {
    expect(tools).toEqual(TOOLS);
  });

  it("keeps out the procedures that can carry data out or read a private mailbox", () => {
    for (const key of ["ics.fetch", "mail.headers"]) {
      expect(registry.get(key.split("."))?.handler, key).toBeDefined();
      expect(tools).not.toContain(key);
    }
    for (const key of ["notify.send", "restic.run", "tailscale.run"]) expect(registry.get(key.split("."))).toBeUndefined();
  });

  /** The `process` of Node: the tests of this package have no types of Node. */
  const nodeProcess = (globalThis as unknown as { process: { emitWarning: (message: string, options?: unknown) => void } }).process;

  /** The four network calls of the bundle, each to a host that the default host policy refuses. */
  const refusedCalls: Array<[string, unknown]> = [
    ["geo.geocode", { query: "x", userAgent: "test/1.0", baseUrl: "http://127.0.0.1:8080" }],
    ["geo.route", { from: { lat: 0, lon: 0 }, to: { lat: 1, lon: 1 }, baseUrl: "http://169.254.169.254" }],
    ["weather.forecast", { lat: 0, lon: 0, baseUrl: "http://10.0.0.5" }],
    ["ics.fetch", { url: "http://[::1]:5232/calendar.ics" }],
  ];
  const failure = async (registry: ReturnType<typeof createRegistry>, key: string, input: unknown): Promise<unknown> => {
    const path = key.split(".");
    return invokePath(path, input, { registry })
      .then((output) => outputValue(output, path))
      .then(
        () => undefined,
        (caught: unknown) => caught
      );
  };

  // Audit pass 2 (O55, D35): in 0.28 a refused host still works, with one notice for each module
  it("sends a refused host of its network procedures with the global fetch, with mcpHostModules first, and emits one notice for each module", async () => {
    const global = vi.fn(async () => Promise.reject(new Error("the global fetch was used")));
    vi.stubGlobal("fetch", global);
    const emitWarning = vi.spyOn(nodeProcess, "emitWarning").mockImplementation(() => undefined);
    try {
      // The dev-tools server builds its registry so
      const host = createRegistry(...mcpHostModules, bundleAssistantModule);
      for (const [key, input] of refusedCalls) {
        const error = await failure(host, key, input);
        expect(isHostNotAllowed(error), key).toBe(false);
        expect(String((error as Error).message), key).toMatch(/did not answer/);
      }
      expect(global).toHaveBeenCalledTimes(refusedCalls.length);
      const codes: Array<string | undefined> = emitWarning.mock.calls.map((call: unknown[]) => (call[1] as { code?: string } | undefined)?.code);
      expect(codes.filter((code) => code === GEO_PRIVATE_HOST_NOTICE.code)).toHaveLength(1);
      expect(codes.filter((code) => code === ICS_PRIVATE_HOST_NOTICE.code)).toHaveLength(1);
      expect(codes.filter((code) => code === "PROCEDURES_WEATHER_PRIVATE_HOST")).toHaveLength(1);
      expect(GEO_PRIVATE_HOST_NOTICE.message).toContain("createGeoModule({ fetch: createHostFetch({ allow: [...] }) })");
      expect(ICS_PRIVATE_HOST_NOTICE.message).toContain("createIcsModule({ fetch: createHostFetch({ allow: [...] }) })");
    } finally {
      emitWarning.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  // The new path: modules with createHostFetch() refuse such a host now, as 0.29.0 does by default
  it("refuses a refused host with the modules of createHostFetch() before the bundle", async () => {
    const strict = createHostFetch();
    const host = createRegistry(createGeoModule({ fetch: strict }), createIcsModule({ fetch: strict }), createWeatherModule({ fetch: strict }), bundleAssistantModule);
    for (const [key, input] of refusedCalls) expect(isHostNotAllowed(await failure(host, key, input)), key).toBe(true);
  });

  // mark registers the module of each package, one package at a time, in one registry
  it("registers next to the default modules of geo and ics, one package at a time", () => {
    const shared = createRegistry(bundleAssistantModule);
    expect(() => registerModules(shared, [geoModule])).not.toThrow();
    expect(() => registerModules(shared, [icsModule])).not.toThrow();
    expect(shared.get(["weather", "forecast"])?.handler).toBeDefined();
  });

  it("has tools that change nothing", () => {
    for (const key of TOOLS) {
      const effects = effectsOf(registry.get(key.split("."))!);
      expect(effects?.writes, key).toEqual([]);
    }
  });
});
