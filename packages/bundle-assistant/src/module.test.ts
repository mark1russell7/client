/**
 * The tool surface of the assistant bundle (roadmap R48). The list of tools is what Claude can
 * call when a host opts in, so this test pins it: change it only on purpose.
 */

import { describe, expect, it } from "vitest";
import { createRegistry, effectsOf, invokePath, outputValue, surfaceRule } from "@procedures/client";
import { isHostNotAllowed } from "@procedures/http";
import geoModule from "@procedures/geo/module";
import icsModule from "@procedures/ics/module";
import { bundleAssistantModule, mcpExclude, mcpNamespaces, registerBundleAssistantProcedures } from "./module.js";

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

  // Audit pass 2 (O55): before, these procedures fetched each URL of their caller with the global fetch
  it("sends the requests of its network procedures through the host policy", async () => {
    const calls: Array<[string, unknown]> = [
      ["geo.geocode", { query: "x", userAgent: "test/1.0", baseUrl: "http://127.0.0.1:8080" }],
      ["geo.route", { from: { lat: 0, lon: 0 }, to: { lat: 1, lon: 1 }, baseUrl: "http://169.254.169.254" }],
      ["weather.forecast", { lat: 0, lon: 0, baseUrl: "http://10.0.0.5" }],
      ["ics.fetch", { url: "http://[::1]:5232/calendar.ics" }],
    ];
    for (const [key, input] of calls) {
      const path = key.split(".");
      const error = await invokePath(path, input, { registry })
        .then((output) => outputValue(output, path))
        .then(
          () => undefined,
          (caught: unknown) => caught
        );
      expect(isHostNotAllowed(error), key).toBe(true);
    }
  });

  // The site and mark import the register entries of geo, ics and this bundle into one registry
  it("registers next to the default modules of geo and ics in one registry", () => {
    const shared = createRegistry(icsModule, geoModule);
    expect(() => registerBundleAssistantProcedures(shared)).not.toThrow();
    expect(shared.get(["weather", "forecast"])?.handler).toBeDefined();
  });

  it("has tools that change nothing", () => {
    for (const key of TOOLS) {
      const effects = effectsOf(registry.get(key.split("."))!);
      expect(effects?.writes, key).toEqual([]);
    }
  });
});
