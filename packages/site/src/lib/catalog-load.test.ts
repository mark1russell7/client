import { describe, expect, it } from "vitest";
import { catalogFailureFor, INITIAL_CATALOG_LOAD, nextCatalogLoad, type CatalogLoad } from "./catalog-load";
import type { CatalogData } from "./seo";

const catalog = { packages: [], procedures: [] } as unknown as CatalogData;
const stale = new TypeError("Failed to fetch dynamically imported module");

describe("the load of the catalog", () => {
  it("shows a failure only on the page of its route", () => {
    const failed = nextCatalogLoad(INITIAL_CATALOG_LOAD, { type: "failed", key: "catalog/a?", error: stale });
    expect(catalogFailureFor(failed, "catalog/a?")).toEqual({ key: "catalog/a?", error: stale });
    expect(catalogFailureFor(failed, "catalog/b?")).toBeNull();
    expect(catalogFailureFor(failed, "catalog/a?q=x")).toBeNull();
  });

  it("shows no error after a failure on one route and a load on the next route", () => {
    // The import fails on route A, the user goes to route B, and the import of route B succeeds
    let state: CatalogLoad = nextCatalogLoad(INITIAL_CATALOG_LOAD, { type: "failed", key: "catalog/a?", error: stale });
    expect(catalogFailureFor(state, "catalog/b?")).toBeNull();
    state = nextCatalogLoad(state, { type: "loaded", catalog });
    expect(state.catalog).toBe(catalog);
    expect(catalogFailureFor(state, "catalog/b?")).toBeNull();
    expect(catalogFailureFor(state, "catalog/a?")).toBeNull();
  });

  it("shows a second failure on the new route", () => {
    let state = nextCatalogLoad(INITIAL_CATALOG_LOAD, { type: "failed", key: "catalog/a?", error: stale });
    const second = new TypeError("Failed again");
    state = nextCatalogLoad(state, { type: "failed", key: "catalog/b?", error: second });
    expect(catalogFailureFor(state, "catalog/b?")?.error).toBe(second);
    expect(catalogFailureFor(state, "catalog/a?")).toBeNull();
  });

  it("gives an error when the import rejects with no value", () => {
    const state = nextCatalogLoad(INITIAL_CATALOG_LOAD, { type: "failed", key: "catalog/a?", error: undefined });
    expect(catalogFailureFor(state, "catalog/a?")?.error).toBeInstanceOf(Error);
  });
});
