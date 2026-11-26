/**
 * The request and the answer of the Census Geocoder, with no network.
 */
import { describe, expect, it } from "vitest";
import { CENSUS_BENCHMARK, CENSUS_GEOCODER_HOST, CENSUS_GEOCODER_URL, censusAddressExchange, censusMatches } from "./census.js";

const userAgent = "test-app/1.0 (test@example.org)";

/** An answer of the geocoder in its form of 2026, with a made-up address. */
const answer = {
  result: {
    input: { address: { street: "12 Made Up Rd", city: "Sometown", state: "VT" }, benchmark: { id: "4", benchmarkName: "Public_AR_Current" } },
    addressMatches: [
      {
        tigerLine: { side: "R", tigerLineId: "123456" },
        coordinates: { x: -72.5, y: 44.25 },
        addressComponents: { zip: "05000", streetName: "MADE UP", city: "SOMETOWN", state: "VT" },
        matchedAddress: "12 MADE UP RD, SOMETOWN, VT, 05000",
      },
    ],
  },
};

describe("censusAddressExchange", () => {
  it("gives a GET of the address in parts, with the current benchmark and the User-Agent", () => {
    const exchange = censusAddressExchange({ street: "12 Made Up Rd", city: "Sometown", state: "VT" }, userAgent);
    const url = new URL(exchange.url);
    expect(exchange.method).toBe("GET");
    expect(exchange.body).toBeNull();
    expect(`${url.origin}${url.pathname}`).toBe(CENSUS_GEOCODER_URL);
    expect(url.hostname).toBe(CENSUS_GEOCODER_HOST);
    expect(Object.fromEntries(url.searchParams)).toEqual({ street: "12 Made Up Rd", city: "Sometown", state: "VT", benchmark: CENSUS_BENCHMARK, format: "json" });
    expect(exchange.headers).toMatchObject({ accept: "application/json", "user-agent": userAgent });
  });

  it("sends only the parts that the address has", () => {
    const url = new URL(censusAddressExchange({ street: "1 Main St", zip: "05001" }, userAgent, "Public_AR_Census2020", "https://example.org/geocoder").url);
    expect(url.origin).toBe("https://example.org");
    expect(Object.fromEntries(url.searchParams)).toEqual({ street: "1 Main St", zip: "05001", benchmark: "Public_AR_Census2020", format: "json" });
  });
});

describe("censusMatches", () => {
  it("gives the point on the address range and the matched address", () => {
    expect(censusMatches(answer)).toEqual([{ lat: 44.25, lon: -72.5, matchedAddress: "12 MADE UP RD, SOMETOWN, VT, 05000", side: "R", tigerLineId: "123456" }]);
  });

  it("gives no match for an address with no range, and skips a match with no correct point", () => {
    expect(censusMatches({ result: { addressMatches: [] } })).toEqual([]);
    const bad = { result: { addressMatches: [{ coordinates: { x: "west", y: 44 } }, { coordinates: { x: -72, y: 95 } }, { coordinates: { x: -72, y: 44 } }] } };
    expect(censusMatches(bad)).toEqual([{ lat: 44, lon: -72, matchedAddress: "", side: null, tigerLineId: null }]);
  });

  it("fails for an answer that is not an answer of the geocoder", () => {
    expect(() => censusMatches({ errors: ["Specify street"] })).toThrow(/no list of address matches/);
    expect(() => censusMatches("<html>")).toThrow(/no list of address matches/);
  });
});
