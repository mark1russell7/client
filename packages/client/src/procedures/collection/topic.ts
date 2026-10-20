/**
 * The topics of the change events of a collection (roadmap CLI-15, CLI-17 and CLI-42). This module
 * has the one function that makes a topic, the functions that read it, and the topic rule of a
 * collection. Each part of the client that makes or reads the topic of a collection or of a
 * partition uses them.
 *
 * - `collections.<name>` is the topic of a collection. The name stays as it is, also with a dot.
 * - `collections.<name>.<partition>` is the topic of a partition. In this form, the name encodes
 *   `%` as `%25` and `.` as `%2E`. Thus the first dot after `collections.` ends the name, and the
 *   partition after that dot can have each character, also `.`, `/` and `%`.
 * - The partition stays as it is, and so does a name without `.` and `%`. Thus each topic of a
 *   partition of a name without `.` and `%` stays the same as before CLI-42.
 * - Only the canonical form of a topic counts: a parse gives a collection and a partition only when
 *   `collectionChangeTopic(collection, partition)` gives the same topic. Thus `%2e` is no alias of
 *   `%2E`, and a rule or an `allow` function that compares the strings sees each topic one way.
 * - The topic of a collection whose name has a dot, `collections.a.b`, has the same form as the
 *   topic of the partition `b` of the collection `a`. Only the repository knows the collection, so
 *   `collectionTopicTarget()` decides with it.
 * - `ProcedureServer` refuses a storage of `a.b` while `a` has partitions, in each order (roadmap
 *   CLI-57, decision D23). Thus the readers of `a.b` do not get the events of a partition of `a`.
 */
import type { RepositoryProvider } from "../types.js";

/** The prefix of the topic of each collection. */
const PREFIX = "collections.";

/** This function encodes the name of a collection for a topic with a partition: `%` and `.` become `%25` and `%2E`. */
function encodeTopicName(name: string): string {
  return name.replace(/[%.]/g, (char) => (char === "%" ? "%25" : "%2E"));
}

/** This function decodes the name of a topic with a partition. The parse then checks the canonical form. */
function decodeTopicName(segment: string): string {
  return segment.replace(/%(25|2E)/g, (_sequence, code: string) => (code === "25" ? "%" : "."));
}

/**
 * This function gives the topic of the change events of a collection: `collections.<name>`, or
 * `collections.<name>.<partition>` for a partition (roadmap CLI-17). In the topic of a partition,
 * the name encodes `%` and `.` (roadmap CLI-42), so `collectionTopicPartition()` gives back the
 * same collection and the same partition.
 *
 * @example
 * ```typescript
 * collectionChangeTopic("notes", "t1/board:b1"); // "collections.notes.t1/board:b1"
 * collectionChangeTopic("graph.nodes", "acme/space"); // "collections.graph%2Enodes.acme/space"
 * collectionChangeTopic("graph.nodes"); // "collections.graph.nodes"
 * ```
 */
export function collectionChangeTopic(collection: string, partition?: string): string {
  return partition === undefined ? `${PREFIX}${collection}` : `${PREFIX}${encodeTopicName(collection)}.${partition}`;
}

/**
 * This function gives the collection and the partition of a topic `collections.<name>` or
 * `collections.<name>.<partition>`, or undefined for another topic. It reads the topic alone:
 * `collectionTopicTarget()` also knows the collections of a repository.
 *
 * - The first dot after the name ends the name. In a topic with a partition, the name is decoded:
 *   `%2E` is a dot and `%25` is a `%` (roadmap CLI-42).
 * - Each character after that dot is the partition. A partition has one character at least.
 * - A topic that is not in the canonical form gives undefined: `collectionChangeTopic()` of the
 *   result always gives the topic again. Thus `collections.a%2eb.t1` names no collection.
 * - For each name and each partition, `collectionTopicPartition(collectionChangeTopic(name,
 *   partition))` gives the same name and the same partition.
 */
export function collectionTopicPartition(topic: string): { collection: string; partition: string | undefined } | undefined {
  if (!topic.startsWith(PREFIX)) return undefined;
  const rest = topic.slice(PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot === -1) return rest === "" ? undefined : { collection: rest, partition: undefined };
  if (dot === 0 || dot === rest.length - 1) return undefined;
  const collection = decodeTopicName(rest.slice(0, dot));
  const partition = rest.slice(dot + 1);
  // Only the canonical form counts: an alias of an escape names no collection
  return collectionChangeTopic(collection, partition) === topic ? { collection, partition } : undefined;
}

/**
 * This function gives the collection and the partition part of a topic of a call, with the
 * repository of the call: one rule for the read check and for the listener of the publisher.
 *
 * - A collection of the repository whose name is the whole rest of the topic wins, with or without
 *   partitions: its name can have a dot. The call then asks for no partition.
 * - Else `collectionTopicPartition()` reads the topic: the first dot after the name ends the name,
 *   and the rest is the partition that the call asks for. In this form, the name encodes `%` and
 *   `.`, so the name of a collection with partitions can have a dot (roadmap CLI-42).
 */
export function collectionTopicTarget(topic: string, repository: RepositoryProvider | undefined): { collection: string; partition: string | undefined } | undefined {
  if (!topic.startsWith(PREFIX)) return undefined;
  const whole = topic.slice(PREFIX.length);
  if (whole !== "" && repository?.hasCollection(whole)) return { collection: whole, partition: undefined };
  return collectionTopicPartition(topic);
}

/**
 * This function gives the topic rule of a collection for `EventPublisher` (the option `topics`):
 * the topic of the collection, and the pattern of the topics of its partitions (roadmap CLI-42).
 * Build the rule of a collection with it. Do not join the parts yourself: a dotted name needs its
 * encoded form in the pattern.
 *
 * - The rule always has the two forms. For a collection with partitions, the plain topic asks for
 *   no partition, and the resolver of the partition decides.
 * - For a collection without partitions, a topic of a partition passes the rule. The publisher then
 *   refuses it with `FORBIDDEN` (reason `partition-not-allowed`).
 * - The pattern matches only the canonical form of a topic, so an alias of an escape gets
 *   `TOPIC_NOT_FOUND`.
 *
 * @example
 * ```typescript
 * collectionTopicRule("graph.nodes"); // ["collections.graph.nodes", "collections.graph%2Enodes.*"]
 * new EventPublisher({ bus, topics: ["orders.*", ...collectionTopicRule("graph.nodes")] });
 * ```
 */
export function collectionTopicRule(collection: string): string[] {
  return [collectionChangeTopic(collection), `${PREFIX}${encodeTopicName(collection)}.*`];
}
