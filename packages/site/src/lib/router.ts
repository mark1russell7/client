/**
 * A small hash router. GitHub Pages serves static files only, so the route is in the hash:
 * `#/composer`, `#/catalog/git.status`, `#/composer?p=<program>`.
 */

import { useEffect, useState } from "react";

export interface Route {
  /** The first segment: "", "composer", "catalog", "architecture", "claude". */
  page: string;
  /** The rest of the path, for example the key of a procedure. */
  rest: string;
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const text = hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = text.split("?", 2);
  const [page = "", ...rest] = path.split("/");
  return { page, rest: decodeURIComponent(rest.join("/")), query: new URLSearchParams(query) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

/** A link target: `href("catalog", "git.status")` gives "#/catalog/git.status". */
export function href(page: string, rest?: string, query?: Record<string, string>): string {
  const path = rest ? `${page}/${encodeURIComponent(rest)}` : page;
  const search = query ? `?${new URLSearchParams(query).toString()}` : "";
  return `#/${path}${search}`;
}

/** This function changes the hash without a new history entry (for the state of the Composer). */
export function replaceHash(hash: string): void {
  window.history.replaceState(null, "", hash);
}
