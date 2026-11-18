/**
 * The state of the load of the catalog, as data. The app loads the catalog the first time that a
 * route needs it. A failed load keeps the key of its route: only the page of that route shows the
 * error. Another route that needs the catalog shows its loading state and tries the load again.
 */

import type { CatalogData } from "./seo";

/** The failure of one load: the key of its route and the error of the import. */
export interface CatalogFailure {
  readonly key: string;
  readonly error: unknown;
}

/** The catalog after a load, and the last failure. */
export interface CatalogLoad {
  readonly catalog: CatalogData | null;
  readonly failure: CatalogFailure | null;
}

/** One event of the load: the catalog loaded, or the load of a route failed. */
export type CatalogEvent = { readonly type: "loaded"; readonly catalog: CatalogData } | { readonly type: "failed"; readonly key: string; readonly error: unknown };

/** The state before the first load. */
export const INITIAL_CATALOG_LOAD: CatalogLoad = { catalog: null, failure: null };

/** This function gives the state after an event. A load clears the failure. */
export function nextCatalogLoad(state: CatalogLoad, event: CatalogEvent): CatalogLoad {
  if (event.type === "loaded") return { catalog: event.catalog, failure: null };
  return { catalog: state.catalog, failure: { key: event.key, error: event.error ?? new Error("The catalog did not load") } };
}

/** This function gives the failure that the page of a route shows: only a failure of the same route, and only while the catalog is absent. */
export function catalogFailureFor(state: CatalogLoad, routeKey: string): CatalogFailure | null {
  return state.catalog === null && state.failure?.key === routeKey ? state.failure : null;
}
