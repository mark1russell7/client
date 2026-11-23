import { distanceMeters, type Geometry, type LatLon } from "@mark1russell7/geo";
import { describe, expect, it } from "vitest";
import { STREET_WORDS, houseNumbers, locateAddress, normalizeStreet, parseStreetAddress, townBox, type AddressInterpolation } from "./address.js";
import type { OsmFeature } from "./features.js";

// The places are made up: streets in the ocean near latitude 0 and longitude 0. A street goes from west to east along the equator.
const METERS_PER_LON = 111_319.49;
const METERS_PER_LAT = 110_574.3;
/** This function gives the point at `x` metres to the east and `y` metres to the north of latitude 0 and longitude 0. */
const at = (x: number, y: number): LatLon => ({ lat: y / METERS_PER_LAT, lon: x / METERS_PER_LON });
const position = (x: number, y: number): [number, number] => [x / METERS_PER_LON, y / METERS_PER_LAT];
const feature = (id: string, geometry: Geometry, properties: Record<string, string>): OsmFeature => ({ type: "Feature", id, geometry, properties });

/** The three ways of Elm Street, 1100 m long. The second way has the opposite direction. */
const elmWays = [
  feature("way/1", { type: "LineString", coordinates: [position(0, 0), position(150, 0), position(300, 0)] }, { highway: "residential", name: "Elm Street" }),
  feature("way/2", { type: "LineString", coordinates: [position(650, 0), position(500, 0), position(300, 0)] }, { highway: "residential", name: "Elm Street" }),
  feature("way/3", { type: "LineString", coordinates: [position(650, 0), position(1100, 0)] }, { highway: "residential", name: "Elm Street" }),
  feature("way/4", { type: "LineString", coordinates: [position(0, 200), position(1100, 200)] }, { highway: "residential", name: "Oak Road" }),
];

/** The place of house `n` of Elm Street: 8 m along the street for each number, the even numbers 12 m to the north, the odd numbers 12 m to the south. */
const house = (n: number): { x: number; y: number } => ({ x: 10 + 8 * n, y: n % 2 === 0 ? 12 : -12 });
const houseFeature = (n: number, street = "Elm Street"): OsmFeature => {
  const { x, y } = house(n);
  return feature(`node/${n}`, { type: "Point", coordinates: position(x, y) }, { "addr:housenumber": String(n), "addr:street": street });
};
const houses = (numbers: readonly number[]): OsmFeature[] => numbers.map((n) => houseFeature(n));
const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const error = (point: LatLon, n: number): number => distanceMeters(point, at(house(n).x, house(n).y));

describe("normalizeStreet", () => {
  it("writes each form of a street word as its key, with no case, points, commas, apostrophes or accents", () => {
    expect(normalizeStreet("St. Mark's Avenue")).toBe("st marks ave");
    expect(normalizeStreet("Saint Marks Ave")).toBe("st marks ave");
    expect(normalizeStreet("  North  Élm   Street ")).toBe("n elm st");
    expect(normalizeStreet("Elmstreet")).toBe("elmstreet");
  });

  it("uses the table of the caller", () => {
    const words = { str: ["strasse", "straße"], pl: ["platz"] };
    expect(normalizeStreet("Linden Straße", words)).toBe(normalizeStreet("Linden Str.", words));
    expect(normalizeStreet("Linden Street", words)).toBe("linden street");
    expect(STREET_WORDS["st"]).toContain("street");
  });
});

describe("parseStreetAddress", () => {
  it("divides a street line into the house number and the street name", () => {
    expect(parseStreetAddress("12B Elm Street")).toEqual({ number: "12B", street: "Elm Street" });
    expect(parseStreetAddress(" 7, Oak Road ")).toEqual({ number: "7", street: "Oak Road" });
    expect(parseStreetAddress("Lindenstrasse 5", { order: "number-last" })).toEqual({ number: "5", street: "Lindenstrasse" });
  });

  it("gives undefined for a text with no house number at its place", () => {
    expect(parseStreetAddress("Elm Street")).toBeUndefined();
    expect(parseStreetAddress("12")).toBeUndefined();
    expect(parseStreetAddress("12 Elm Street", { order: "number-last" })).toBeUndefined();
  });
});

describe("houseNumbers", () => {
  it("gives each number of a list, in lower case with no spaces", () => {
    expect(houseNumbers("12;14, 16 A")).toEqual(["12", "14", "16a"]);
    expect(houseNumbers(" ; ")).toEqual([]);
  });
});

describe("townBox", () => {
  const square = (west: number, south: number, size: number): Geometry => ({
    type: "Polygon",
    coordinates: [[[west, south], [west + size, south], [west + size, south + size], [west, south + size], [west, south]]],
  });
  const boundaries = [
    feature("relation/1", square(0, 0, 0.25), { boundary: "administrative", admin_level: "8", name: "Town of Exampleton" }),
    feature("relation/2", square(0.125, 0.125, 0.25), { boundary: "postal_code", postal_code: "00001" }),
    feature("relation/3", square(2, 2, 0.25), { boundary: "administrative", admin_level: "8", name: "Sampleton" }),
    feature("relation/4", square(4, 4, 0.25), { boundary: "census", name: "Exampleton" }),
  ];

  it("gives the box of the boundaries with the name and the areas with the postal code", () => {
    expect(townBox(boundaries, { name: "exampleton" })).toEqual({ west: 0, south: 0, east: 0.25, north: 0.25 });
    expect(townBox(boundaries, { name: "Exampleton", postcode: "00001" })).toEqual({ west: 0, south: 0, east: 0.375, north: 0.375 });
    expect(townBox(boundaries, { postcode: "00001" })).toEqual({ west: 0.125, south: 0.125, east: 0.375, north: 0.375 });
  });

  it("gives undefined when no boundary matches", () => {
    expect(townBox(boundaries, { name: "Testville" })).toBeUndefined();
    expect(townBox(boundaries, {})).toBeUndefined();
  });
});

describe("locateAddress: a match", () => {
  it("gives the center of the element with the street and the number, with no use of the street line", () => {
    const building = feature("way/10", { type: "Polygon", coordinates: [[position(100, 10), position(120, 10), position(120, 30), position(100, 30), position(100, 10)]] }, { "addr:housenumber": "12;14", "addr:street": "Elm St." });
    const found = locateAddress({ address: { number: "14", street: "Elm Street" }, addresses: [building, houseFeature(20)] });
    expect(found).toMatchObject({ kind: "match", ids: ["way/10"], spreadMeters: 0 });
    expect(found.kind === "match" && distanceMeters(found.point, at(110, 20))).toBeLessThan(0.01);
  });

  it("compares the numbers with no case, and gives the spread of the elements with the number", () => {
    const one = feature("node/1", { type: "Point", coordinates: position(0, 0) }, { "addr:housenumber": "12A", "addr:street": "Elm Street" });
    const two = feature("node/2", { type: "Point", coordinates: position(30, 0) }, { "addr:housenumber": "12a", "addr:street": "Elm Street" });
    const other = feature("node/3", { type: "Point", coordinates: position(500, 0) }, { "addr:housenumber": "12a", "addr:street": "Oak Road" });
    const found = locateAddress({ address: { number: "12a", street: "Elm Street" }, addresses: [one, two, other] });
    expect(found).toMatchObject({ kind: "match", ids: ["node/1", "node/2"] });
    expect(found.kind === "match" && found.spreadMeters).toBeCloseTo(30, 1);
  });
});

describe("locateAddress: loose features", () => {
  it("skips a feature with no correct geometry, and reads only the string tags", () => {
    const loose = [
      { type: "Feature", id: 1, geometry: null, properties: { "addr:housenumber": "24", "addr:street": "Elm Street" } },
      { type: "Feature", geometry: { type: "Point", coordinates: "no" }, properties: { "addr:housenumber": "24", "addr:street": "Elm Street" } },
      { type: "Feature", geometry: { type: "Point", coordinates: position(0, 0) }, properties: { "addr:housenumber": 24, "addr:street": "Elm Street" } },
      { type: "Feature", geometry: { type: "Point", coordinates: position(0, 0) }, properties: null },
      { type: "Feature", id: 7, geometry: { type: "Point", coordinates: position(5, 5) }, properties: { "addr:housenumber": "24", "addr:street": "Elm Street" } },
    ];
    expect(locateAddress({ address: { number: "24", street: "Elm Street" }, addresses: loose })).toMatchObject({ kind: "match", ids: ["7"], spreadMeters: 0 });
    expect(locateAddress({ address: { number: "24", street: "Elm Street" }, addresses: loose.slice(0, 4), streets: elmWays })).toEqual({ kind: "none", reason: "too-few-numbers" });
  });
});

describe("locateAddress: an interpolation", () => {
  it("interpolates between a lower and a higher number of the same parity, on the side of that parity", () => {
    for (const target of [24, 25]) {
      const found = locateAddress({ address: { number: String(target), street: "Elm Street" }, addresses: houses(range(2, 60).filter((n) => n !== target)), streets: elmWays }) as AddressInterpolation;
      expect(found).toMatchObject({ kind: "interpolation", ways: 3, chains: 1, numbers: 58, bracketed: true });
      expect(found.lineMeters).toBeCloseTo(1100, 0);
      expect(found.sameSide).toBe(target % 2 === 0 ? 29 : 28);
      expect(error(found.point, target)).toBeLessThan(0.5);
      expect(found.errorMeters?.max).toBeLessThan(0.5);
    }
  });

  it("uses a straight-line fit for a number past the known numbers", () => {
    const found = locateAddress({ address: { number: "80", street: "Elm Street" }, addresses: houses(range(2, 40)), streets: elmWays }) as AddressInterpolation;
    expect(found).toMatchObject({ kind: "interpolation", bracketed: false });
    expect(error(found.point, 80)).toBeLessThan(0.5);
  });

  it("uses the line through the two numbers when only two numbers are known", () => {
    const found = locateAddress({ address: { number: "30", street: "Elm Street" }, addresses: houses([10, 20]), streets: elmWays }) as AddressInterpolation;
    expect(found).toMatchObject({ kind: "interpolation", bracketed: false, numbers: 2 });
    expect(error(found.point, 30)).toBeLessThan(0.5);
    expect(found.errorMeters?.max).toBeCloseTo(80, 0);
  });

  it("puts a number with no known number of its parity on the side opposite to the other numbers", () => {
    const found = locateAddress({ address: { number: "7", street: "Elm Street" }, addresses: houses([2, 4, 6, 10, 12]), streets: elmWays }) as AddressInterpolation;
    expect(found).toMatchObject({ kind: "interpolation", sameSide: 0 });
    expect(error(found.point, 7)).toBeLessThan(0.5);
  });

  it("uses the line with the most known numbers, when the ways of the street make two lines", () => {
    const far = feature("way/9", { type: "LineString", coordinates: [position(5000, 0), position(6000, 0)] }, { highway: "residential", name: "Elm Street" });
    const found = locateAddress({ address: { number: "31", street: "Elm Street" }, addresses: [...houses(range(20, 40).filter((n) => n !== 31)), houseFeature(1)], streets: [far, ...elmWays] }) as AddressInterpolation;
    expect(found).toMatchObject({ kind: "interpolation", ways: 4, chains: 2 });
    expect(error(found.point, 31)).toBeLessThan(0.5);
  });

  it("finds the point of each removed number of a seeded draw within 0.5 m on a regular street", () => {
    let state = 2024;
    const next = (): number => {
      state = (state * 48271) % 2147483647;
      return state;
    };
    for (let run = 0; run < 40; run++) {
      const numbers = range(1, 120).filter(() => next() % 3 !== 0);
      const target = numbers.splice(next() % numbers.length, 1)[0] as number;
      const found = locateAddress({ address: { number: String(target), street: "Elm Street" }, addresses: houses(numbers), streets: elmWays });
      expect(found.kind, `run ${run}`).toBe("interpolation");
      expect(found.kind === "interpolation" && error(found.point, target), `run ${run}`).toBeLessThan(0.5);
    }
  });
});

describe("locateAddress: no point", () => {
  it("gives the reason when the data gives no point", () => {
    expect(locateAddress({ address: { number: "24", street: "Elm Street" }, addresses: houses([2, 4]) })).toEqual({ kind: "none", reason: "no-street-line" });
    expect(locateAddress({ address: { number: "24", street: "Elm Street" }, addresses: houses([2, 2]), streets: elmWays })).toEqual({ kind: "none", reason: "too-few-numbers" });
    expect(locateAddress({ address: { number: "24", street: "Pine Lane" }, addresses: houses([2, 4]), streets: elmWays })).toEqual({ kind: "none", reason: "no-street-line" });
    expect(locateAddress({ address: { number: "A", street: "Elm Street" }, addresses: houses([2, 4]), streets: elmWays })).toEqual({ kind: "none", reason: "no-number" });
    expect(locateAddress({ address: { number: " ", street: "Elm Street" }, addresses: houses([2, 4]), streets: elmWays })).toEqual({ kind: "none", reason: "no-number" });
  });
});
