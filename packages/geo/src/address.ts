/**
 * The point of a street address from the map data of OpenStreetMap, with no request to a geocoder.
 * The caller fetches the boundaries, the address elements and the street lines of a box, for example with `osmFeatures`.
 * Then these functions find the point on the computer of the caller. Thus the address does not go to a server.
 * The functions are pure and use no network, so a browser bundle can use them.
 */
import { bboxCenter, bboxOfGeoJson, distanceMeters, joinLines, lineReference, parseGeometry, type BBox, type Geometry, type LatLon, type LineReference, type Position } from "@mark1russell7/geo";
import { azimuthalEquidistant, type PlanePoint } from "@mark1russell7/geo/projection";
import { leastSquares, median } from "@mark1russell7/rigor-statistics";

/**
 * A feature of the map data, as the function `osmFeatures` or the procedure `geo.osmFeatures` gives it.
 * The functions read only the string tags, and skip a feature with no correct GeoJSON geometry.
 */
export interface MapFeature {
  readonly id?: string | number | undefined;
  readonly geometry?: unknown;
  readonly properties: Readonly<Record<string, unknown>> | null;
}

/** This function gives the value of a tag of a feature, or an empty string when the tag is not a string. */
function tagOf(feature: MapFeature, key: string): string {
  const value = feature.properties?.[key];
  return typeof value === "string" ? value : "";
}

/** This function gives the geometry of a feature, or `undefined` when it is not a correct GeoJSON geometry. */
function geometryOf(feature: MapFeature): Geometry | undefined {
  if (feature.geometry === undefined || feature.geometry === null) return undefined;
  const parsed = parseGeometry(feature.geometry);
  return parsed.tag === "ok" ? parsed.value : undefined;
}

/** A table of street words: each key is a short form, and its list has the other forms with the same meaning. */
export type StreetWords = Readonly<Record<string, readonly string[]>>;

/**
 * The words of the street names of the United States with the same meaning. `normalizeStreet` writes each form as its key.
 * A caller with street names of a different country gives its own table.
 */
export const STREET_WORDS: StreetWords = Object.freeze({
  st: ["street", "saint"],
  ave: ["avenue", "av"],
  rd: ["road"],
  dr: ["drive"],
  ln: ["lane"],
  blvd: ["boulevard"],
  pl: ["place"],
  ter: ["terrace"],
  ct: ["court"],
  cir: ["circle"],
  pkwy: ["parkway"],
  hwy: ["highway"],
  sq: ["square"],
  mt: ["mount"],
  n: ["north"],
  s: ["south"],
  e: ["east"],
  w: ["west"],
});

const shortForms = new WeakMap<StreetWords, ReadonlyMap<string, string>>();

/** This function gives the map from each form of a table to its key. */
function shortFormsOf(words: StreetWords): ReadonlyMap<string, string> {
  const known = shortForms.get(words);
  if (known !== undefined) return known;
  const forms = new Map<string, string>();
  for (const [key, others] of Object.entries(words)) for (const form of [key, ...others]) forms.set(form, key);
  shortForms.set(words, forms);
  return forms;
}

/**
 * This function gives the form of a street name that `locateAddress` compares. The form has lower case, and no accents,
 * points, commas or apostrophes. Each whole word of `words` becomes its key. Thus "St. Mark's Avenue" and "Saint Marks Ave" give the same form.
 */
export function normalizeStreet(name: string, words: StreetWords = STREET_WORDS): string {
  const forms = shortFormsOf(words);
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.,'’]/g, "")
    .split(/\s+/)
    .filter((word) => word !== "")
    .map((word) => forms.get(word) ?? word)
    .join(" ");
}

/** A street address: the house number and the name of the street. */
export interface StreetAddress {
  readonly number: string;
  readonly street: string;
}

/** The options of `parseStreetAddress`. */
export interface ParseStreetAddressOptions {
  /** The place of the house number in the text. The default is `number-first`, as in "12 Elm Street". */
  readonly order?: "number-first" | "number-last" | undefined;
}

/**
 * This function divides the street line of an address into the house number and the street name.
 * A number is digits with one letter or no letter, for example `12` or `12B`. A text with no number gives `undefined`.
 */
export function parseStreetAddress(text: string, options: ParseStreetAddressOptions = {}): StreetAddress | undefined {
  // The function cuts the text with index loops, not with a regular expression: the time is linear in each text.
  const line = trimSeparators(text);
  let cut: number;
  let number: string;
  let street: string;
  if (options.order === "number-last") {
    cut = line.length;
    while (cut > 0 && !isSeparator(line[cut - 1])) cut -= 1;
    number = line.slice(cut);
    street = trimSeparators(line.slice(0, cut));
  } else {
    cut = 0;
    while (cut < line.length && !isSeparator(line[cut])) cut += 1;
    number = line.slice(0, cut);
    street = trimSeparators(line.slice(cut));
  }
  return HOUSE_NUMBER.test(number) && street !== "" ? { number, street } : undefined;
}

/** A house number of a street line: digits with one letter or no letter. */
const HOUSE_NUMBER = /^\d+[a-z]?$/i;

/** This function gives `true` for a character that divides the parts of a street line: a space or a comma. */
function isSeparator(char: string | undefined): boolean {
  return char !== undefined && (char === "," || char.trim() === "");
}

/** This function gives the text with no spaces and no commas at its start and at its end. */
function trimSeparators(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isSeparator(text[start])) start += 1;
  while (end > start && isSeparator(text[end - 1])) end -= 1;
  return text.slice(start, end);
}

/**
 * This function gives the house numbers of the tag `addr:housenumber` of OpenStreetMap, in lower case with no spaces.
 * A value with a list, for example `12;14`, gives each number of the list.
 */
export function houseNumbers(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((part) => part.replace(/\s+/g, "").toLowerCase())
    .filter((part) => part !== "");
}

/** The town of `townBox`: its name, its postal code, or both. */
export interface TownQuery {
  readonly name?: string | undefined;
  readonly postcode?: string | undefined;
}

/**
 * This function gives the box of the boundaries of a town. The boundaries are the administrative boundaries with its name,
 * and the areas with its postal code. A name match ignores the case and the first words "Town of", "City of" and similar words.
 * No match gives `undefined`. The box does not cross the line of longitude 180.
 */
export function townBox(boundaries: readonly MapFeature[], town: TownQuery): BBox | undefined {
  const name = town.name === undefined ? undefined : townName(town.name);
  const boxes = boundaries
    .filter(
      (feature) =>
        (name !== undefined && tagOf(feature, "boundary") === "administrative" && townName(tagOf(feature, "name")) === name) ||
        (town.postcode !== undefined && tagOf(feature, "postal_code") === town.postcode),
    )
    .map((feature) => {
      const geometry = geometryOf(feature);
      return geometry === undefined ? undefined : bboxOfGeoJson(geometry);
    })
    .filter((box): box is BBox => box !== undefined);
  if (boxes.length === 0) return undefined;
  return {
    west: Math.min(...boxes.map((box) => box.west)),
    south: Math.min(...boxes.map((box) => box.south)),
    east: Math.max(...boxes.map((box) => box.east)),
    north: Math.max(...boxes.map((box) => box.north)),
  };
}

/** This function gives the form of a town name that `townBox` compares. */
function townName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^(?:[a-z]+\/)?(?:city|town|village|borough|township|municipality) of\s+/, "");
}

/** The input of `locateAddress`. */
export interface LocateAddressInput {
  readonly address: StreetAddress;
  /** The address elements of the area: the features with the tags `addr:housenumber` and `addr:street`. */
  readonly addresses: readonly MapFeature[];
  /** The roads of the area: the features with the tags `highway` and `name`. Only an interpolation uses them. */
  readonly streets?: readonly MapFeature[] | undefined;
  /** The table of street words. The default is `STREET_WORDS`. */
  readonly words?: StreetWords | undefined;
  /** The town and the postal code of the address. Only a choice between elements with the same number in different towns uses them. */
  readonly area?: AddressArea | undefined;
}

/**
 * The town and the postal code of an address. Two towns of a search box can have the same street and the same number.
 * The tags `addr:postcode` and `addr:city` of an element tell which town it is in.
 */
export interface AddressArea {
  readonly postcode?: string | undefined;
  readonly town?: string | undefined;
}

/** An address element of the map has the number of the address. */
export interface AddressMatch {
  readonly kind: "match";
  /** The center of the box of the first element. */
  readonly point: LatLon;
  /** The ids of the elements with the number, for example `way/123`. An element with no id gives no id. */
  readonly ids: readonly string[];
  /** The largest distance from `point` to the center of another element with the number, in metres. */
  readonly spreadMeters: number;
}

/** The map has no element with the number, so the point is an interpolation along the street line. */
export interface AddressInterpolation {
  readonly kind: "interpolation";
  readonly point: LatLon;
  /** The number of ways with the street name. */
  readonly ways: number;
  /** The number of lines that the ways make when they join at their ends. */
  readonly chains: number;
  /** The length of the line of the interpolation, in metres. */
  readonly lineMeters: number;
  /** The number of different house numbers on the line of the interpolation. */
  readonly numbers: number;
  /** The number of known numbers with the parity of the number. They give the side of the street. */
  readonly sameSide: number;
  /** This value is `true` when a lower and a higher number of the same parity are known. */
  readonly bracketed: boolean;
  /**
   * The error of the method on the known numbers, in metres. The method removes each known element in turn, and finds its point from the others.
   * This value is `undefined` when no element has another element to find its point from.
   */
  readonly errorMeters?: { readonly median: number; readonly max: number } | undefined;
}

/** The map data does not give a point for the address. */
export interface AddressMiss {
  readonly kind: "none";
  /** The reason: the address has no number, the street has no line, or the line has fewer than 2 known numbers. */
  readonly reason: "no-number" | "no-street-line" | "too-few-numbers";
}

/** The point of an address from the map data, or the reason that the data gives no point. */
export type AddressPoint = AddressMatch | AddressInterpolation | AddressMiss;

/** A known house number on a street line. */
interface Known {
  /** The index of the element in the elements of the street. */
  readonly element: number;
  readonly number: number;
  /** The center of the element on the plane of the street. */
  readonly at: PlanePoint;
  readonly along: number;
  readonly side: -1 | 0 | 1;
  readonly distance: number;
}

/**
 * This function keeps the elements with the number that agree best with the area of the address.
 * - An element agrees when its tag `addr:postcode` or `addr:city` is the same as the area.
 * - An element with a different tag is against the area. An element with neither tag is neutral.
 * - The function keeps the elements that agree. With none, it keeps the neutral elements. With none, it keeps all elements.
 */
function inArea<T extends { readonly postcode: string | undefined; readonly town: string | undefined }>(hits: readonly T[], area: AddressArea | undefined): readonly T[] {
  if (area === undefined || hits.length < 2) return hits;
  const town = area.town === undefined ? undefined : townName(area.town);
  const fit = (hit: T): number => {
    const postcode = area.postcode === undefined || hit.postcode === undefined ? 0 : hit.postcode.trim() === area.postcode.trim() ? 1 : -1;
    const city = town === undefined || hit.town === undefined ? 0 : townName(hit.town) === town ? 1 : -1;
    return postcode < 0 || city < 0 ? -1 : Math.max(postcode, city);
  };
  for (const level of [1, 0]) {
    const kept = hits.filter((hit) => fit(hit) === level);
    if (kept.length > 0) return kept;
  }
  return hits;
}

/**
 * This function gives the point of a street address from the address elements and the roads of the map.
 * An element with the street and the number gives the point. Else the function interpolates the number along the street line.
 *
 * - The interpolation joins the ways of the street into lines with `joinLines`. It uses the line with the most known numbers.
 * - The numbers of the same parity give the side of the street and the distance from the line.
 * - A lower and a higher number of the same parity give the distance along the line. Else a straight-line fit of all numbers gives it.
 * - All measures are on one `azimuthalEquidistant` plane at the center of the box of the street.
 */
export function locateAddress(input: LocateAddressInput): AddressPoint {
  const words = input.words ?? STREET_WORDS;
  const street = normalizeStreet(input.address.street, words);
  const number = houseNumbers(input.address.number)[0];
  if (number === undefined) return { kind: "none", reason: "no-number" };
  const onStreet = input.addresses
    .filter((feature) => normalizeStreet(tagOf(feature, "addr:street"), words) === street)
    .flatMap((feature) => {
      const center = centerOf(feature);
      return center === undefined ? [] : [{ id: feature.id, center, numbers: houseNumbers(tagOf(feature, "addr:housenumber")), postcode: tagOf(feature, "addr:postcode") || undefined, town: tagOf(feature, "addr:city") || undefined }];
    });
  const hits = inArea(onStreet.filter((element) => element.numbers.includes(number)), input.area);
  const first = hits[0];
  if (first !== undefined) {
    const spreadMeters = Math.max(0, ...hits.map((hit) => distanceMeters(first.center, hit.center)));
    const ids = hits.flatMap((hit) => (hit.id === undefined ? [] : [String(hit.id)]));
    return { kind: "match", point: first.center, ids, spreadMeters };
  }
  const target = numberValue(number);
  if (target === undefined) return { kind: "none", reason: "no-number" };
  const lines = (input.streets ?? []).filter((feature) => normalizeStreet(tagOf(feature, "name"), words) === street).flatMap((feature) => linesOf(geometryOf(feature)));
  const box = lines.length === 0 ? undefined : bboxOfGeoJson({ type: "MultiLineString", coordinates: lines });
  if (box === undefined) return { kind: "none", reason: "no-street-line" };
  const projection = azimuthalEquidistant(bboxCenter(box));
  const chains = joinLines(lines).map((line) => lineReference(line, { projection }));
  const points = onStreet.flatMap((element, index) => {
    const at = projection.toPlane(element.center);
    return element.numbers.flatMap((text) => {
      const value = numberValue(text);
      return value === undefined ? [] : [{ element: index, number: value, center: element.center, at }];
    });
  });
  // Each known number votes for its nearest line. The line with the most votes wins, and a tie keeps the first line.
  const nearest = points.map((point) => nearestChain(chains, point.center));
  const votes = chains.map((_, index) => nearest.filter((chain) => chain === index).length);
  const chosen = votes.indexOf(Math.max(...votes));
  const chain = chains[chosen] as LineReference;
  const known: Known[] = points
    .filter((_, index) => nearest[index] === chosen)
    .map((point) => {
      const place = chain.nearest(point.center);
      return { element: point.element, number: point.number, at: point.at, along: place.alongMeters, side: place.side, distance: place.meters };
    });
  if (new Set(known.map((point) => point.number)).size < 2) return { kind: "none", reason: "too-few-numbers" };
  const estimate = estimateOn(chain, known, target);
  const errors = [...new Set(known.map((point) => point.element))].flatMap((element) => {
    const others = known.filter((point) => point.element !== element);
    if (others.length === 0) return [];
    return known
      .filter((point) => point.element === element)
      .map((point) => {
        const found = projection.toPlane(estimateOn(chain, others, point.number).point);
        return Math.hypot(found.x - point.at.x, found.y - point.at.y);
      });
  });
  return {
    kind: "interpolation",
    point: estimate.point,
    ways: lines.length,
    chains: chains.length,
    lineMeters: chain.lengthMeters,
    numbers: new Set(known.map((point) => point.number)).size,
    sameSide: estimate.sameSide,
    bracketed: estimate.bracketed,
    errorMeters: errors.length === 0 ? undefined : { median: median(errors), max: Math.max(...errors) },
  };
}

/** This function gives the center of the box of the geometry of a feature, or `undefined` for a feature with no position. */
function centerOf(feature: MapFeature): LatLon | undefined {
  const geometry = geometryOf(feature);
  const box = geometry === undefined ? undefined : bboxOfGeoJson(geometry);
  return box === undefined ? undefined : bboxCenter(box);
}

/**
 * This function gives the lines of a geometry: one for a `LineString`, each part of a `MultiLineString`, and none for the other types.
 * It skips a line with fewer than 2 positions.
 */
function linesOf(geometry: Geometry | undefined): (readonly Position[])[] {
  if (geometry === undefined) return [];
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? [...geometry.coordinates] : [];
  return lines.filter((line) => line.length >= 2);
}

/** This function gives the value of the digits at the start of a house number, or `undefined` when it starts with no digit. */
function numberValue(text: string): number | undefined {
  const digits = /^\d+/.exec(text);
  return digits === null ? undefined : Number.parseInt(digits[0], 10);
}

/** This function gives the index of the line nearest to a point. A tie keeps the first line. */
function nearestChain(chains: readonly LineReference[], point: LatLon): number {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  chains.forEach((chain, index) => {
    const meters = chain.nearest(point).meters;
    if (meters < distance) {
      best = index;
      distance = meters;
    }
  });
  return best;
}

/** This function gives the estimated point of a house number on a line, from the known numbers of the line. */
function estimateOn(chain: LineReference, known: readonly Known[], target: number): { point: LatLon; sameSide: number; bracketed: boolean } {
  const parity = target % 2;
  const same = known.filter((point) => point.number % 2 === parity);
  const alongs = meanAlongs(same);
  const equal = alongs.get(target);
  const lower = Math.max(...[...alongs.keys()].filter((value) => value < target));
  const higher = Math.min(...[...alongs.keys()].filter((value) => value > target));
  let along: number;
  let bracketed = true;
  if (equal !== undefined) along = equal;
  else if (Number.isFinite(lower) && Number.isFinite(higher)) {
    const low = alongs.get(lower) as number;
    along = low + ((target - lower) / (higher - lower)) * ((alongs.get(higher) as number) - low);
  } else {
    along = fitAlong(known, target);
    bracketed = false;
  }
  // The numbers of the same parity give the side and the distance. With none, the side is opposite to the other numbers.
  const sides = same.length > 0 ? same : known;
  const sum = sides.reduce((total, point) => total + point.side, 0);
  const side = (same.length > 0 ? Math.sign(sum) : -Math.sign(sum)) || 1;
  const offset = median(sides.map((point) => point.distance));
  return { point: chain.pointAt(along, side * offset), sameSide: same.length, bracketed };
}

/** This function gives the mean distance along the line of each house number. */
function meanAlongs(known: readonly Known[]): Map<number, number> {
  const sums = new Map<number, { total: number; count: number }>();
  for (const point of known) {
    const sum = sums.get(point.number) ?? { total: 0, count: 0 };
    sums.set(point.number, { total: sum.total + point.along, count: sum.count + 1 });
  }
  return new Map([...sums].map(([value, sum]) => [value, sum.total / sum.count]));
}

/**
 * This function gives the distance along the line of a number from a straight-line fit of all known numbers.
 * The fit is `leastSquares` of `@mark1russell7/rigor-statistics`. With fewer than 3 known numbers, or with a fit of no full rank,
 * the function uses the line through the lowest and the highest number. With one number, it gives its distance.
 */
function fitAlong(known: readonly Known[], target: number): number {
  if (known.length >= 3) {
    const [intercept, slope] = leastSquares(
      known.map((point) => [point.number]),
      known.map((point) => point.along),
    ).coefficients;
    if (intercept !== undefined && slope !== undefined && Number.isFinite(intercept) && Number.isFinite(slope)) return intercept + slope * target;
  }
  const alongs = meanAlongs(known);
  const lowest = Math.min(...alongs.keys());
  const highest = Math.max(...alongs.keys());
  const low = alongs.get(lowest) as number;
  if (highest === lowest) return low;
  return low + ((target - lowest) / (highest - lowest)) * ((alongs.get(highest) as number) - low);
}
