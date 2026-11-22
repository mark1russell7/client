/**
 * The soil at a point, from the USDA NRCS Soil Data Access service (SSURGO): the map unit and its major components.
 * Each component has its septic field rating, its slope, its drainage class and its hydric rating.
 * The request builder and the extractor are pure functions.
 */

import type { Exchange } from "polite-crawler/api";

/** The tabular endpoint of Soil Data Access. It takes a SQL query in a JSON body. */
export const SOIL_DATA_ACCESS_URL = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest";

/** The citation of the soil data. SSURGO is a work of the US government, in the public domain. */
export const SSURGO_ATTRIBUTION = "Soil Survey Staff, Natural Resources Conservation Service, USDA. Soil Survey Geographic (SSURGO) Database.";

/** The name of the SSURGO rule for septic tank absorption fields. */
export const SEPTIC_RULE = "ENG - Septic Tank Absorption Fields";

/** The rating classes of a SSURGO interpretation, from the best to the worst. */
export type SoilRatingClass = "Not limited" | "Somewhat limited" | "Very limited";

/** One major component of the map unit at a point. */
export interface SoilComponent {
  readonly mukey: string;
  /** This value is the name of the map unit, for example `Kenduskeag-Monarda complex, 0 to 8 percent slopes`. */
  readonly mapUnit: string;
  readonly component: string;
  /** This value is the percent of the map unit that the component covers (`comppct_r`), or null. */
  readonly percent: number | null;
  /** This value is the septic rating class, or null when the survey has no rating for the component. */
  readonly septic: SoilRatingClass | null;
  /** This value is the septic rating from 0 (no limit) to 1 (the most limit), or null. */
  readonly septicValue: number | null;
  /** These values are the low, representative and high slope of the component, in percent, or null. */
  readonly slope: { readonly low: number | null; readonly representative: number | null; readonly high: number | null };
  /** This value is the drainage class, for example `Somewhat poorly drained`, or null. */
  readonly drainage: string | null;
  /** This value is the hydric rating (`Yes`, `No` or `Unranked`), or null. */
  readonly hydric: string | null;
}

/** This function tells if a longitude and a latitude are on the map. */
function checkPoint(lon: number, lat: number): void {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new RangeError("The point is not on the map: give a longitude from -180 to 180 and a latitude from -90 to 90");
  }
}

/**
 * This function gives the SQL query of the major components of the map unit at a point. The
 * point goes into the query only as two numbers with 6 decimals, so the query has no text from the caller.
 *
 * @throws RangeError when the point is not on the map.
 */
export function soilQuery(lon: number, lat: number): string {
  checkPoint(lon, lat);
  const wkt = `point(${lon.toFixed(6)} ${lat.toFixed(6)})`;
  return [
    "SELECT mu.mukey, mu.muname, c.compname, c.comppct_r, ci.interphrc, ci.interphr, c.slope_l, c.slope_r, c.slope_h, c.drainagecl, c.hydricrating",
    `FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${wkt}') AS k`,
    "INNER JOIN mapunit mu ON mu.mukey = k.mukey",
    "INNER JOIN component c ON c.mukey = mu.mukey AND c.majcompflag = 'Yes'",
    `LEFT JOIN cointerp ci ON ci.cokey = c.cokey AND ci.mrulename = '${SEPTIC_RULE}' AND ci.ruledepth = 0`,
    "ORDER BY c.comppct_r DESC",
  ].join(" ");
}

/**
 * This function gives the POST exchange of the soil query at a point.
 *
 * @throws RangeError when the point is not on the map.
 */
export function soilExchange(lon: number, lat: number, userAgent: string, baseUrl: string = SOIL_DATA_ACCESS_URL): Exchange {
  return {
    method: "POST",
    url: baseUrl,
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": userAgent },
    body: JSON.stringify({ query: soilQuery(lon, lat), format: "JSON+COLUMNNAME" }),
  };
}

const RATING_CLASSES: ReadonlySet<string> = new Set(["Not limited", "Somewhat limited", "Very limited"]);

/** This function gives the number in a cell, or null when the cell is empty or not a number. */
function numberOf(cell: unknown): number | null {
  if (cell === null || cell === undefined || cell === "") return null;
  const value = Number(cell);
  return Number.isFinite(value) ? value : null;
}

/** This function gives the text of a cell, or null when the cell is empty. */
function textOf(cell: unknown): string | null {
  return typeof cell === "string" && cell.trim() !== "" ? cell.trim() : null;
}

/**
 * This function gives the major components of the map unit at the point, from the answer of
 * `soilExchange`. An empty list tells that the survey has no map unit at the point.
 *
 * @throws Error when the answer is not a table of Soil Data Access, or when a column is absent.
 */
export function soilComponents(answer: unknown): SoilComponent[] {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) throw new Error("The answer of Soil Data Access is not an object");
  const table = (answer as Record<string, unknown>)["Table"];
  // Soil Data Access gives `{}` when the query has no rows
  if (table === undefined) return [];
  if (!Array.isArray(table) || table.length === 0 || !Array.isArray(table[0])) throw new Error("The answer of Soil Data Access has no table with column names");
  const names = (table[0] as unknown[]).map(String);
  const column = (name: string): number => {
    const index = names.indexOf(name);
    if (index < 0) throw new Error(`The answer of Soil Data Access has no column ${name}`);
    return index;
  };
  const at = Object.fromEntries(["mukey", "muname", "compname", "comppct_r", "interphrc", "interphr", "slope_l", "slope_r", "slope_h", "drainagecl", "hydricrating"].map((name) => [name, column(name)]));
  return table.slice(1).map((row): SoilComponent => {
    if (!Array.isArray(row)) throw new Error("The answer of Soil Data Access has a row that is not a list");
    const cell = (name: string): unknown => row[at[name]!];
    const rating = textOf(cell("interphrc"));
    return {
      mukey: String(cell("mukey") ?? ""),
      mapUnit: textOf(cell("muname")) ?? "",
      component: textOf(cell("compname")) ?? "",
      percent: numberOf(cell("comppct_r")),
      septic: rating !== null && RATING_CLASSES.has(rating) ? (rating as SoilRatingClass) : null,
      septicValue: numberOf(cell("interphr")),
      slope: { low: numberOf(cell("slope_l")), representative: numberOf(cell("slope_r")), high: numberOf(cell("slope_h")) },
      drainage: textOf(cell("drainagecl")),
      hydric: textOf(cell("hydricrating")),
    };
  });
}
