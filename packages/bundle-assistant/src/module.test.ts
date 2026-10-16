/**
 * The tool surface of the assistant bundle (roadmap R48). The list of tools is what Claude can
 * call when a host opts in, so this test pins it: change it only on purpose.
 */

import { describe, expect, it } from "vitest";
import { createRegistry, effectsOf, surfaceRule } from "@procedures/client";
import { bundleAssistantModule, mcpExclude, mcpNamespaces } from "./module.js";

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

  it("has tools that change nothing", () => {
    for (const key of TOOLS) {
      const effects = effectsOf(registry.get(key.split("."))!);
      expect(effects?.writes, key).toEqual([]);
    }
  });
});
