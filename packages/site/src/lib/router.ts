/**
 * A small path router. The route is the path after the base of the site: `/client/composer`,
 * `/client/catalog/git.status`, `/client/composer?p=<program>`.
 *
 * Each page has its own URL, so a search engine and a link preview read each page. The build
 * writes an HTML file for each static page (refer to `build/spa-fallback-plugin.ts`), and
 * GitHub Pages serves `404.html` (the app) for any other path. The old hash links
 * (`#/catalog/git.status`) move to the path form when the site starts (refer to `legacyHashUrl`).
 */

import { useEffect, useState } from "react";
import { basePath, normalizeBase } from "./base";

export interface Route {
  /** The first segment: "", "composer", "catalog", "architecture", "claude", "lab", "status". */
  page: string;
  /** The rest of the path, for example the key of a procedure. */
  rest: string;
  query: URLSearchParams;
}

/** The base path of the site, with a slash at each end ("/client/"). */
export const BASE: string = normalizeBase(import.meta.env.BASE_URL);

/** `decodeURIComponent` that keeps the text when it is not valid (for example "%E0%A4"). */
export function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** The route of a URL path and its query, below `base`. */
export function parseLocation(pathname: string, search: string, base: string = BASE): Route {
  const prefix = basePath(base).replace(/\/+$/, "");
  const rest = prefix !== "" && (pathname === prefix || pathname.startsWith(`${prefix}/`)) ? pathname.slice(prefix.length) : pathname;
  const segments = rest.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "").split("/");
  const [page = "", ...more] = segments;
  let query: URLSearchParams;
  try {
    query = new URLSearchParams(search);
  } catch {
    query = new URLSearchParams();
  }
  return { page: safeDecode(page === "index" ? "" : page), rest: safeDecode(more.join("/")), query };
}

/**
 * The route path of a route, as the build names its HTML file: "" for the home page,
 * "catalog/git.status" for a procedure.
 */
export function routePath(route: Pick<Route, "page" | "rest">): string {
  return [route.page, route.rest].filter((part) => part !== "").join("/");
}

/**
 * The path URL of an old hash link, or null when the hash is not a route. The site used hash
 * routes until October 2026: `#/composer?p=…` becomes `/client/composer?p=…`. A hash that
 * is only an anchor (`#main`) stays.
 */
export function legacyHashUrl(hash: string, base: string = BASE): string | null {
  if (!hash.startsWith("#/")) return null;
  const text = hash.slice(2);
  const [path = "", query = ""] = text.split("?", 2);
  const clean = path.replace(/^\/+|\/+$/g, "");
  return `${basePath(base)}${clean}${clean ? "/" : ""}${query ? `?${query}` : ""}`;
}

/** The route of the current page. */
export function currentRoute(): Route {
  return parseLocation(window.location.pathname, window.location.search);
}

/** The path and the query of the current page: the part of the URL that the site writes. */
export function currentUrl(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** The event that the router sends after it changes the URL of the page. */
const NAVIGATE_EVENT = "site:navigate";

/**
 * The route of the page. A new route object comes after each navigation of the site and each
 * `popstate` event, also when the text is the same (the Back button to a URL that the page wrote).
 */
export function useRoute(): Route {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onChange = (): void => setRoute(currentRoute());
    window.addEventListener(NAVIGATE_EVENT, onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener(NAVIGATE_EVENT, onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);
  return route;
}

/**
 * A link target: `href("catalog", "git.status")` gives "/client/catalog/git.status/". A page path
 * ends with a slash: GitHub Pages serves the `index.html` of its folder with no redirect (a path
 * without the slash redirects when the folder exists), and the canonical URLs have the same form.
 */
export function href(page: string, rest?: string, query?: Record<string, string>, base: string = BASE): string {
  const path = [page, rest ? encodeURIComponent(rest) : ""].filter((part) => part !== "").join("/");
  const entries = Object.entries(query ?? {}).filter(([, value]) => value !== "");
  const search = entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : "";
  return `${basePath(base)}${path}${path ? "/" : ""}${search}`;
}

/**
 * The link of a docs page: `docHref("packages/client-git")` gives
 * "/client/docs/packages/client-git/". A slug can have several segments, so each is encoded on
 * its own (`href` encodes its `rest` as one segment).
 */
export function docHref(slug: string, hash: string = "", base: string = BASE): string {
  const path = slug
    .split("/")
    .filter((segment) => segment !== "")
    .map(encodeURIComponent)
    .join("/");
  return `${basePath(base)}docs/${path}${path ? "/" : ""}${hash ? `#${hash}` : ""}`;
}

/** The history state of the entries that the site writes. A pasted link has no such state. */
const OWN_STATE = { owner: "site" } as const;

/**
 * This function writes the URL without a navigation event, so the page does not render again.
 * "push" makes a new history entry, so the Back button returns to the previous state. "replace"
 * changes the current entry.
 */
export function writeUrl(url: string, mode: "push" | "replace"): void {
  if (currentUrl() === url) return;
  if (mode === "push") window.history.pushState(OWN_STATE, "", url);
  else window.history.replaceState(OWN_STATE, "", url);
}

/** True when the site wrote the current history entry (an edit), false for a link from outside. */
export function isOwnEntry(): boolean {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && (state as { owner?: unknown }).owner === OWN_STATE.owner;
}

/**
 * This function goes to a URL of the site without a reload: a new history entry, then the
 * navigation event. The page moves to the top, as after a page load.
 */
export function navigate(url: string): void {
  if (currentUrl() !== url) window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
  window.scrollTo({ top: 0 });
}

/**
 * The URL of a click on a link that the router can follow, or null. The router follows a plain
 * left click on a link of the same origin below the base, with no target and no download.
 */
export function routableUrl(event: MouseEvent, base: string = BASE): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a");
  if (!anchor || anchor.hasAttribute("download")) return null;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return null;
  const raw = anchor.getAttribute("href");
  if (!raw || raw.startsWith("#")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.startsWith(basePath(base))) return null;
  // The files of the site (the sitemap, an image) are not routes
  if (/\.(xml|txt|png|svg|json|webmanifest)$/.test(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** This function makes the router follow the links of the page. It gives the function that stops it. */
export function interceptLinks(): () => void {
  const onClick = (event: MouseEvent): void => {
    const url = routableUrl(event);
    if (url === null) return;
    event.preventDefault();
    navigate(url);
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
