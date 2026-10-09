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

/** `decodeURIComponent` that keeps the text when it is not valid (for example "%E0%A4"). */
export function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export function parseHash(hash: string): Route {
  const text = hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = text.split("?", 2);
  const [page = "", ...rest] = path.split("/");
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(query);
  } catch {
    params = new URLSearchParams();
  }
  return { page: safeDecode(page), rest: safeDecode(rest.join("/")), query: params };
}

/**
 * The route of the page. A new route object comes after each `hashchange` and `popstate`
 * event, also when the text is the same (the Back button to a hash that the page wrote).
 */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);
  return route;
}

/** A link target: `href("catalog", "git.status")` gives "#/catalog/git.status". */
export function href(page: string, rest?: string, query?: Record<string, string>): string {
  const path = rest ? `${page}/${encodeURIComponent(rest)}` : page;
  const entries = Object.entries(query ?? {}).filter(([, value]) => value !== "");
  const search = entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : "";
  return `#/${path}${search}`;
}

/** The history state of the entries that the site writes. A pasted link has no such state. */
const OWN_STATE = { owner: "site" } as const;

/**
 * This function writes the hash without a `hashchange` event. "push" makes a new history entry,
 * so the Back button returns to the previous state. "replace" changes the current entry.
 */
export function writeHash(hash: string, mode: "push" | "replace"): void {
  if (window.location.hash === hash) return;
  if (mode === "push") window.history.pushState(OWN_STATE, "", hash);
  else window.history.replaceState(OWN_STATE, "", hash);
}

/** True when the site wrote the current history entry (an edit), false for a link from outside. */
export function isOwnEntry(): boolean {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && (state as { owner?: unknown }).owner === OWN_STATE.owner;
}
