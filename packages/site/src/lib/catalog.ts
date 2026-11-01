/**
 * The filters of the catalog and the data of its chart. The chart has one bar for each package:
 * the length is the count of its procedures, and the fill is the count that matches the filters.
 */

/** What the filters and the chart need of a procedure. */
export interface CatalogEntry {
  key: string;
  package: string;
  description: string;
  registered: boolean;
  cli: boolean;
  browser: boolean;
  mcp: boolean;
}

/** The filters of the catalog. The page keeps them in the query of the URL. */
export interface CatalogFilters {
  query: string;
  /** The folder of the selected package, or "" for all packages. */
  pkg: string;
  onlyMcp: boolean;
  onlyCli: boolean;
  onlyBrowser: boolean;
  showUnregistered: boolean;
}

/** This function tells if a procedure matches all the filters except the package filter. */
export function matchesExceptPackage(entry: CatalogEntry, filters: CatalogFilters): boolean {
  if (filters.onlyMcp && !entry.mcp) return false;
  if (filters.onlyCli && !entry.cli) return false;
  if (filters.onlyBrowser && !entry.browser) return false;
  if (!filters.showUnregistered && !entry.registered) return false;
  const text = filters.query.trim().toLowerCase();
  if (text && !entry.key.toLowerCase().includes(text) && !entry.description.toLowerCase().includes(text)) return false;
  return true;
}

/** This function tells if a procedure matches all the filters. */
export function matchesFilters(entry: CatalogEntry, filters: CatalogFilters): boolean {
  if (filters.pkg && entry.package !== filters.pkg) return false;
  return matchesExceptPackage(entry, filters);
}

/** This function tells if a filter other than the package filter removes procedures. */
export function narrows(filters: CatalogFilters): boolean {
  return filters.query.trim() !== "" || filters.onlyMcp || filters.onlyCli || filters.onlyBrowser || !filters.showUnregistered;
}

/** One bar of the chart. */
export interface PackageBar {
  /** The folder of the package. */
  pkg: string;
  /** All the procedures of the package. */
  total: number;
  /** The procedures that match the filters, without the package filter. */
  matching: number;
  /** The procedures that Claude gets as MCP tools, that the CLI has as commands, and that run in the browser. */
  mcp: number;
  cli: number;
  browser: number;
}

/**
 * This function gives one bar for each package that has procedures. The order is the total, from
 * the largest to the smallest, then the name. The filters do not change the order, so a bar stays
 * at its position when the filters change.
 */
export function packageBars(entries: readonly CatalogEntry[], filters: CatalogFilters): PackageBar[] {
  const bars = new Map<string, PackageBar>();
  for (const entry of entries) {
    let bar = bars.get(entry.package);
    if (!bar) {
      bar = { pkg: entry.package, total: 0, matching: 0, mcp: 0, cli: 0, browser: 0 };
      bars.set(entry.package, bar);
    }
    bar.total += 1;
    if (entry.mcp) bar.mcp += 1;
    if (entry.cli) bar.cli += 1;
    if (entry.browser) bar.browser += 1;
    if (matchesExceptPackage(entry, filters)) bar.matching += 1;
  }
  return [...bars.values()].sort((a, b) => b.total - a.total || a.pkg.localeCompare(b.pkg));
}

/**
 * This function gives the bars that show when the chart is collapsed: the first `count` bars, and
 * the bar of the selected package when it is not one of them.
 */
export function visibleBars(bars: readonly PackageBar[], count: number, selected: string): PackageBar[] {
  const first = bars.slice(0, count);
  if (!selected || first.some((bar) => bar.pkg === selected)) return first;
  const extra = bars.find((bar) => bar.pkg === selected);
  return extra ? [...first, extra] : first;
}
