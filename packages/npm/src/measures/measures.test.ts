/**
 * The use measures, on responses recorded on 2026-11-13 from npm, deps.dev and jsDelivr. The name of each recorded
 * file ends with the HTTP status of its response. No test sends a request.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOWNLOADS_BULK_LIMIT,
  type MeasureFetch,
  depsDevDependentsRequest,
  depsDevPackageRequest,
  downloadsRequests,
  extractDepsDevDependents,
  extractDepsDevPackage,
  extractDownloads,
  extractJsdelivrHits,
  extractRegistryDocument,
  extractRegistryVersion,
  jsdelivrHitsRequest,
  measure,
  registryDocumentRequest,
  registryVersionRequest,
} from "./index.js";

const recorded = (file: string): string => readFileSync(join(import.meta.dirname, "__tests__", "recorded", file), "utf8");

describe("the npm downloads", () => {
  const period = "2026-11-01:2026-11-07";

  it("puts the packages without a scope into bulk requests, and each scoped package into its own", () => {
    const names = Array.from({ length: DOWNLOADS_BULK_LIMIT + 2 }, (_, i) => `p${i}`);
    const requests = downloadsRequests([...names, "@stomp/stompjs", "p0"], period);
    expect(requests).toHaveLength(3);
    expect(requests[0]?.url.split(",")).toHaveLength(DOWNLOADS_BULK_LIMIT);
    expect(requests[1]?.url).toBe(`https://api.npmjs.org/downloads/point/${period}/p128,p129`);
    expect(requests[2]?.url).toBe(`https://api.npmjs.org/downloads/point/${period}/@stomp/stompjs`);
  });

  it("refuses a bad name and a bad period", () => {
    expect(() => downloadsRequests(["Bad Name"])).toThrow(/not a valid npm package name/);
    expect(() => downloadsRequests(["a"], "yesterday" as "last-day")).toThrow(/not a period/);
  });

  it("reads a bulk response, with a missing package", () => {
    const [request] = downloadsRequests(["sockette", "robust-websocket", "no-such-package-wirelab-x"], period);
    expect(extractDownloads(recorded("npm-downloads-bulk.200.json"), request?.url ?? "")).toEqual({
      rows: [
        { package: "sockette", start: "2026-11-01", end: "2026-11-07", downloads: 23772 },
        { package: "robust-websocket", start: "2026-11-01", end: "2026-11-07", downloads: 6996 },
      ],
      missing: ["no-such-package-wirelab-x"],
    });
  });

  it("reads the response of a scoped package", () => {
    const [request] = downloadsRequests(["@stomp/stompjs"], period);
    expect(extractDownloads(recorded("npm-downloads-scoped.200.json"), request?.url ?? "").rows).toEqual([
      { package: "@stomp/stompjs", start: "2026-11-01", end: "2026-11-07", downloads: 675690 },
    ]);
  });

  it("puts a package that npm does not know in missing", () => {
    const [request] = downloadsRequests(["no-such-package-wirelab-x"], period);
    expect(extractDownloads(recorded("npm-downloads-missing.404.json"), request?.url ?? "")).toEqual({ rows: [], missing: ["no-such-package-wirelab-x"] });
  });

  it("throws on an error that is not a missing package", () => {
    const url = `https://api.npmjs.org/downloads/point/${period}/sockette`;
    expect(() => extractDownloads('{"error":"Too many requests"}', url)).toThrow(/answered the error "Too many requests"/);
    expect(() => extractDownloads("<html>busy</html>", url)).toThrow(/not a JSON object/);
  });
});

describe("deps.dev", () => {
  it("encodes a scoped name as one segment", () => {
    expect(depsDevPackageRequest("@stomp/stompjs").url).toBe("https://api.deps.dev/v3/systems/npm/packages/%40stomp%2Fstompjs");
    expect(depsDevDependentsRequest("@stomp/stompjs", "7.0.0").url).toBe("https://api.deps.dev/v3alpha/systems/npm/packages/%40stomp%2Fstompjs/versions/7.0.0:dependents");
  });

  it("reads the versions and the default version of a package", () => {
    const { rows, missing } = extractDepsDevPackage(recorded("deps-dev-package.200.json"), depsDevPackageRequest("sockette").url);
    expect(missing).toEqual([]);
    expect(rows[0]?.package).toBe("sockette");
    expect(rows[0]?.defaultVersion).toBe("2.0.6");
    expect(rows[0]?.versions.find((v) => v.isDefault)).toEqual({ version: "2.0.6", publishedAt: "2019-06-16T06:16:33Z", isDefault: true, deprecated: null });
  });

  it("reads a scoped package", () => {
    const { rows } = extractDepsDevPackage(recorded("deps-dev-package-scoped.200.json"), depsDevPackageRequest("@stomp/stompjs").url);
    expect(rows[0]?.package).toBe("@stomp/stompjs");
    expect(rows[0]?.defaultVersion).not.toBeNull();
  });

  it("reads the dependents of a version", () => {
    const request = depsDevDependentsRequest("sockette", "2.0.6");
    expect(extractDepsDevDependents(recorded("deps-dev-dependents.200.json"), request.url).rows).toEqual([
      { package: "sockette", version: "2.0.6", dependents: 63, direct: 53, indirect: 10 },
    ]);
  });

  it("puts what deps.dev does not know in missing", () => {
    expect(extractDepsDevPackage(recorded("deps-dev-package-missing.404.txt"), depsDevPackageRequest("no-such-package-wirelab-x").url).missing).toEqual(["no-such-package-wirelab-x"]);
    expect(extractDepsDevDependents(recorded("deps-dev-dependents-missing.404.txt"), depsDevDependentsRequest("sockette", "9.9.9").url).missing).toEqual(["sockette@9.9.9"]);
  });
});

describe("jsDelivr", () => {
  it("reads the hits, the ranks and the period of a package", () => {
    const request = jsdelivrHitsRequest("sockette");
    expect(request.url).toBe("https://data.jsdelivr.com/v1/stats/packages/npm/sockette?period=month");
    expect(extractJsdelivrHits(recorded("jsdelivr-hits.200.json"), request.url).rows).toEqual([
      { package: "sockette", period: "month", start: "2026-10-13", end: "2026-11-11", hits: 558, rank: 262015, typeRank: 158971, previousHits: 338 },
    ]);
  });

  it("gives 0 hits and no rank for a package that jsDelivr does not know", () => {
    const row = extractJsdelivrHits(recorded("jsdelivr-hits-missing.200.json"), jsdelivrHitsRequest("no-such-package-wirelab-x").url).rows[0];
    expect(row).toMatchObject({ hits: 0, rank: null, typeRank: null });
  });

  it("keeps the slash of a scoped name", () => {
    expect(jsdelivrHitsRequest("@stomp/stompjs", "week").url).toBe("https://data.jsdelivr.com/v1/stats/packages/npm/@stomp/stompjs?period=week");
  });
});

describe("the npm registry", () => {
  it("reads the version document of a tag", () => {
    const request = registryVersionRequest("sockette");
    expect(request.url).toBe("https://registry.npmjs.org/sockette/latest");
    expect(extractRegistryVersion(recorded("registry-version.200.json"), request.url).rows).toEqual([
      { package: "sockette", version: "2.0.6", deprecated: null, repository: expect.stringContaining("lukeed/sockette"), repositoryDirectory: null, license: "MIT" },
    ]);
  });

  it("reads a deprecation and a scoped name", () => {
    const deprecated = extractRegistryVersion(recorded("registry-version-deprecated.200.json"), registryVersionRequest("nats.ws").url).rows[0];
    expect(deprecated?.deprecated).toMatch(/^Package deprecated\. Use @nats-io\/nats-core/);
    const request = registryVersionRequest("@stomp/stompjs");
    expect(request.url).toBe("https://registry.npmjs.org/@stomp%2Fstompjs/latest");
    expect(extractRegistryVersion(recorded("registry-version-scoped.200.json"), request.url).rows[0]?.package).toBe("@stomp/stompjs");
  });

  it("reads the abbreviated document", () => {
    const request = registryDocumentRequest("sockette");
    expect(request.accept).toBe("application/vnd.npm.install-v1+json");
    const row = extractRegistryDocument(recorded("registry-document.200.json"), request.url).rows[0];
    expect(row).toMatchObject({ package: "sockette", modified: "2022-06-26T21:59:10.370Z", distTags: { latest: "2.0.6" }, latestDeprecated: null });
    expect(row?.versions).toBeGreaterThan(5);
  });

  it("puts a package that the registry does not know in missing", () => {
    const name = "no-such-package-wirelab-x";
    expect(extractRegistryVersion(recorded("registry-version-missing.404.json"), registryVersionRequest(name).url).missing).toEqual([name]);
    expect(extractRegistryDocument(recorded("registry-document-missing.404.json"), registryDocumentRequest(name).url).missing).toEqual([name]);
  });
});

describe("measure", () => {
  it("sends the request through the given fetch, with its Accept header, and reads the body", async () => {
    const calls: { url: string; accept: string | undefined }[] = [];
    const fetch: MeasureFetch = async (url, init) => {
      calls.push({ url, accept: init.headers["accept"] });
      return { text: async () => recorded("registry-document.200.json") };
    };
    const result = await measure(fetch, registryDocumentRequest("sockette"), extractRegistryDocument);
    expect(calls).toEqual([{ url: "https://registry.npmjs.org/sockette", accept: "application/vnd.npm.install-v1+json" }]);
    expect(result.rows[0]?.distTags).toEqual({ latest: "2.0.6" });
  });

  it("accepts globalThis.fetch as a fetch", () => {
    const fetch: MeasureFetch = globalThis.fetch;
    expect(typeof fetch).toBe("function");
  });
});
