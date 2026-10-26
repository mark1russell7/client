/**
 * The escape of a segment (roadmap CLI-75). Each segment and each list of segments come back the
 * same after the encode and the decode, also with `.`, `%` and a literal `%2E` in a segment. A
 * segment without `.` and `%` encodes to itself.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { decodeSegment, encodeSegment, segmentsToTopic, topicToSegments } from "./segments.js";

/** Segments with many dots and `%` sequences. */
const tricky = fc.array(fc.constantFrom("a", "b", ".", "%", "2", "E", "e", "5"), { maxLength: 12 }).map((chars) => chars.join(""));

describe("encodeSegment and decodeSegment (CLI-75)", () => {
  it("keep a segment without . and % the same", () => {
    for (const plain of ["notes", "docker", "e2e", "a-b_c", "", "x/y", "über"]) {
      expect(encodeSegment(plain)).toBe(plain);
      expect(decodeSegment(plain)).toBe(plain);
    }
  });

  it("encode % first and then the dot", () => {
    expect(encodeSegment("e2e.tabs")).toBe("e2e%2Etabs");
    expect(encodeSegment("100%")).toBe("100%25");
    expect(encodeSegment("a%2Eb")).toBe("a%252Eb");
    expect(encodeSegment("..")).toBe("%2E%2E");
    expect(encodeSegment("%.")).toBe("%25%2E");
  });

  it("decode %2E, %2e and %25, and keep each other % sequence", () => {
    expect(decodeSegment("e2e%2Etabs")).toBe("e2e.tabs");
    expect(decodeSegment("e2e%2etabs")).toBe("e2e.tabs");
    expect(decodeSegment("100%25")).toBe("100%");
    expect(decodeSegment("a%252Eb")).toBe("a%2Eb");
    // A raw % of an old client stays a %
    expect(decodeSegment("50%off")).toBe("50%off");
    expect(decodeSegment("%")).toBe("%");
    expect(decodeSegment("%2F")).toBe("%2F");
  });

  it("give each segment back after the encode and the decode", () => {
    for (const segment of ["e2e.tabs", "100%", "a%2Eb", "%2E", "%25", "..", ".", "%", "a.b.c", "%%..%2e"]) {
      expect(decodeSegment(encodeSegment(segment))).toBe(segment);
      expect(encodeSegment(segment)).not.toContain(".");
    }
    fc.assert(
      fc.property(fc.oneof(tricky, fc.string()), (segment) => {
        const encoded = encodeSegment(segment);
        expect(encoded).not.toContain(".");
        expect(decodeSegment(encoded)).toBe(segment);
      }),
    );
  });
});

describe("segmentsToTopic and topicToSegments (CLI-75)", () => {
  it("keep the text of plain segments the same", () => {
    expect(segmentsToTopic(["orders", "created"])).toBe("orders.created");
    expect(segmentsToTopic(["docker", "compose", "up"])).toBe("docker.compose.up");
    expect(segmentsToTopic(["morning"])).toBe("morning");
    expect(topicToSegments("docker.compose.up")).toEqual(["docker", "compose", "up"]);
    expect(topicToSegments("morning")).toEqual(["morning"]);
  });

  it("keep a segment with a dot as one segment", () => {
    expect(segmentsToTopic(["collections", "e2e.tabs"])).toBe("collections.e2e%2Etabs");
    expect(topicToSegments("collections.e2e%2Etabs")).toEqual(["collections", "e2e.tabs"]);
    expect(segmentsToTopic(["collections", "e2e.tabs", "find"])).toBe("collections.e2e%2Etabs.find");
    expect(segmentsToTopic(["a%2Eb"])).toBe("a%252Eb");
    expect(topicToSegments("a%252Eb")).toEqual(["a%2Eb"]);
  });

  it("give each list of one segment or more back", () => {
    for (const segments of [["e2e.tabs"], ["collections", "e2e.tabs", "find"], ["100%", "a%2Eb"], ["..", "."], [""], ["a", ""]]) {
      expect(topicToSegments(segmentsToTopic(segments))).toEqual(segments);
    }
    fc.assert(
      fc.property(fc.array(fc.oneof(tricky, fc.string()), { minLength: 1, maxLength: 5 }), (segments) => {
        expect(topicToSegments(segmentsToTopic(segments))).toEqual(segments);
      }),
    );
  });
});
