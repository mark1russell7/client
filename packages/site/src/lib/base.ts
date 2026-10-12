/**
 * The base path of the site. The app and the build (refer to `build/`) use the same rule, so
 * this module reads no browser value.
 */

/** A base path with a slash at each end. A full URL keeps its form, with a slash at the end. */
export function normalizeBase(value: string | undefined): string {
  const text = (value ?? "/").trim();
  if (text === "" || text === "/" || text === "./") return "/";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text.endsWith("/") ? text : `${text}/`;
  const leading = text.startsWith("/") ? text : `/${text}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
}

/** The path part of a base: "/client/" for "/client/" and for "https://host/client/". */
export function basePath(base: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(base) ? new URL(base).pathname : base;
}
