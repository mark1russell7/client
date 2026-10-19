/**
 * The topics of a collection and of a partition (roadmap CLI-42). The topic of a partition encodes
 * the name of the collection, so each name and each partition parse back to the same pair, and
 * each topic of a partition that a host had before stays the same.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { collectionChangeTopic, collectionTopicPartition, collectionTopicRule } from "./topic.js";
import { collectionTopicReads } from "./changes.js";
import { collectionTopicTarget } from "./partition.js";
import type { RepositoryProvider } from "../types.js";
import { topicMatcher } from "../../events/publisher.js";

/** A repository that knows some collections, with or without partitions. */
function repositoryWith(partitioned: readonly string[], plain: readonly string[] = []): RepositoryProvider {
  const known = new Set([...partitioned, ...plain]);
  return {
    getStorage: () => {
      throw new Error("no storage in this test");
    },
    hasCollection: (name) => known.has(name),
    hasPartitions: (name) => partitioned.includes(name),
  };
}

/** The characters that make a topic hard to read: the separator, the escape and the parts of the escapes. */
const HARD = [".", "/", "%", "2", "5", "E", "e", "a", ":", "-"];
const hardString = fc.array(fc.constantFrom(...HARD), { minLength: 1, maxLength: 12 }).map((chars) => chars.join(""));
/** A name or a partition: a mix of the hard characters and of each other string. */
const anyPart = fc.oneof(hardString, fc.string({ minLength: 1, maxLength: 24 }), fc.string({ unit: "grapheme", minLength: 1, maxLength: 8 }));
/** A name without `.` and `%`, as each collection with partitions had before CLI-42. */
const plainName = fc.stringMatching(/^[A-Za-z0-9_:@~+|/-]{1,32}$/);
/** A partition of the characters that `PARTITION_PATTERN` permits. */
const validPartition = fc.stringMatching(/^[A-Za-z0-9_.:@~+|/-]{1,64}$/);

describe("the topic of a partition (CLI-42)", () => {
  it("keeps the exact topic of each partition of a name without a dot or %", () => {
    expect(collectionChangeTopic("notes", "t1")).toBe("collections.notes.t1");
    expect(collectionChangeTopic("notes", "t1/board:b1")).toBe("collections.notes.t1/board:b1");
    expect(collectionChangeTopic("examples", "acme/space")).toBe("collections.examples.acme/space");
    expect(collectionChangeTopic("notes", "a.b")).toBe("collections.notes.a.b");
    expect(collectionChangeTopic("notes")).toBe("collections.notes");
    // The form of before CLI-42, for each name and partition that a host could use then
    fc.assert(
      fc.property(plainName, validPartition, (name, partition) => {
        expect(collectionChangeTopic(name, partition)).toBe(`collections.${name}.${partition}`);
        expect(collectionTopicPartition(`collections.${name}.${partition}`)).toEqual({ collection: name, partition });
      }),
      { numRuns: 500 },
    );
  });

  it("keeps the topic of a collection without a partition as it is, also with a dot", () => {
    expect(collectionChangeTopic("graph.nodes")).toBe("collections.graph.nodes");
    expect(collectionChangeTopic("100%")).toBe("collections.100%");
  });

  it("encodes the dots and the % of the name in the topic of a partition", () => {
    expect(collectionChangeTopic("graph.nodes", "acme/space")).toBe("collections.graph%2Enodes.acme/space");
    expect(collectionChangeTopic("a.b.c", "x.y")).toBe("collections.a%2Eb%2Ec.x.y");
    expect(collectionChangeTopic("100%", "t1")).toBe("collections.100%25.t1");
    expect(collectionChangeTopic("a%2Eb", "t1")).toBe("collections.a%252Eb.t1");
  });

  it("parses a dotted name and a partition with ., / and % back to the same pair", () => {
    const pairs: Array<[string, string]> = [
      ["graph.nodes", "acme/space"],
      ["graph.nodes", "t1.scope/board:b1"],
      ["a.b.c", "50%/x.y"],
      ["a%2Eb", "%2E"],
      ["%", "%"],
      [".", "."],
      ["a.", ".b"],
      ["notes", "a.b/c%d"],
    ];
    for (const [collection, partition] of pairs) {
      expect(collectionTopicPartition(collectionChangeTopic(collection, partition))).toEqual({ collection, partition });
    }
  });

  it("reads only the canonical form: a lowercase escape or a raw % names no collection", () => {
    const repository = repositoryWith(["graph.nodes", "a%41"]);
    for (const alias of ["collections.graph%2enodes.t1", "collections.a%2eb%2Ec.t1", "collections.a%41.t1", "collections.100%.t1"]) {
      expect(collectionTopicPartition(alias), alias).toBeUndefined();
      expect(collectionTopicTarget(alias, repository), alias).toBeUndefined();
      expect(collectionTopicReads(alias, repository), alias).toEqual([]);
    }
    // The canonical forms of the same names
    expect(collectionTopicPartition("collections.graph%2Enodes.t1")).toEqual({ collection: "graph.nodes", partition: "t1" });
    expect(collectionTopicPartition(collectionChangeTopic("a%41", "t1"))).toEqual({ collection: "a%41", partition: "t1" });
  });

  it("gives a collection and a partition only for a topic that collectionChangeTopic() gives again", () => {
    const rest = fc.oneof(hardString, fc.string({ maxLength: 24 }), fc.tuple(hardString, hardString).map(([a, b]) => `${a}.${b}`));
    fc.assert(
      fc.property(rest, (tail) => {
        const topic = `collections.${tail}`;
        const parts = collectionTopicPartition(topic);
        if (parts) expect(collectionChangeTopic(parts.collection, parts.partition)).toBe(topic);
      }),
      { numRuns: 2000 },
    );
  });

  it("parses each generated name and partition back to the same pair, also with a repository", () => {
    fc.assert(
      fc.property(anyPart, anyPart, (collection, partition) => {
        const topic = collectionChangeTopic(collection, partition);
        expect(collectionTopicPartition(topic)).toEqual({ collection, partition });
        expect(collectionTopicReads(topic)).toEqual([`collection:${collection}`]);
        expect(collectionTopicTarget(topic, repositoryWith([collection]))).toEqual({ collection, partition });
        // The topic without a partition: the repository knows the collection
        expect(collectionTopicTarget(collectionChangeTopic(collection), repositoryWith([collection]))).toEqual({ collection, partition: undefined });
      }),
      { numRuns: 2000 },
    );
  });

  it("gives the read of the collection of a topic with an encoded name", () => {
    expect(collectionTopicReads("collections.graph%2Enodes.acme/space")).toEqual(["collection:graph.nodes"]);
    expect(collectionTopicReads("collections.users.team-1")).toEqual(["collection:users"]);
    expect(collectionTopicReads("collections.users.")).toEqual([]);
    expect(collectionTopicReads("collections..x")).toEqual([]);
    expect(collectionTopicReads("collections.")).toEqual([]);
  });

  it("reads the plain topic of a dotted name with the parse of the publisher, when it has the repository", () => {
    const repository = repositoryWith(["graph.nodes"]);
    expect(collectionTopicReads("collections.graph.nodes", repository)).toEqual(["collection:graph.nodes"]);
    expect(collectionTopicReads("collections.graph.nodes", repository)).toEqual([`collection:${collectionTopicTarget("collections.graph.nodes", repository)!.collection}`]);
    // Without the repository, the first dot ends the name
    expect(collectionTopicReads("collections.graph.nodes")).toEqual(["collection:graph"]);
  });

  it("reads a topic that is not of a collection, or that has no name or an empty partition, as before", () => {
    for (const topic of ["orders.created", "collections", "collections.", "collections..x", "collections.notes."]) {
      expect(collectionTopicPartition(topic), topic).toBeUndefined();
    }
  });

  it("gives the topic rule of a collection: the plain topic and the canonical topics of its partitions", () => {
    expect(collectionTopicRule("notes")).toEqual(["collections.notes", "collections.notes.*"]);
    expect(collectionTopicRule("graph.nodes")).toEqual(["collections.graph.nodes", "collections.graph%2Enodes.*"]);
    expect(collectionTopicRule("rate%")).toEqual(["collections.rate%", "collections.rate%25.*"]);
    const known = topicMatcher(collectionTopicRule("graph.nodes"));
    expect(known("collections.graph.nodes")).toBe(true);
    expect(known(collectionChangeTopic("graph.nodes", "acme/space"))).toBe(true);
    expect(known("collections.graph%2enodes.acme/space")).toBe(false);
    expect(known("collections.graph.nodes.acme/space")).toBe(false);
    expect(known("collections.graph")).toBe(false);
  });

  it("lets a collection of the repository whose name is the whole topic win, with or without partitions", () => {
    const repository = repositoryWith(["graph.nodes", "notes"], ["a.b"]);
    expect(collectionTopicTarget("collections.graph.nodes", repository)).toEqual({ collection: "graph.nodes", partition: undefined });
    expect(collectionTopicTarget("collections.graph%2Enodes.acme/space", repository)).toEqual({ collection: "graph.nodes", partition: "acme/space" });
    expect(collectionTopicTarget("collections.a.b", repository)).toEqual({ collection: "a.b", partition: undefined });
    expect(collectionTopicTarget("collections.notes.a.b", repository)).toEqual({ collection: "notes", partition: "a.b" });
    expect(collectionTopicTarget("collections.notes", repository)).toEqual({ collection: "notes", partition: undefined });
    expect(collectionTopicTarget("orders.x", repository)).toBeUndefined();
  });
});
