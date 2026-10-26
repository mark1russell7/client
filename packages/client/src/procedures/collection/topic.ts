/**
 * The topics of the change events of a collection (roadmap CLI-15, CLI-17, CLI-42 and CLI-75). This
 * module has the one function that makes a topic, the functions that read it, and the topic rule
 * of a collection. Each part of the client that makes or reads the topic of a collection or of a
 * partition uses them.
 *
 * - `collections.<name>` is the topic of a collection, and `collections.<name>.<partition>` is the
 *   topic of a partition.
 * - In each topic, the name encodes `%` as `%25` and `.` as `%2E` (`encodeSegment()`). Thus the
 *   first dot after `collections.` ends the name, and the partition after that dot can have each
 *   character, also `.`, `/` and `%`. The partition stays as it is.
 * - A name without `.` and `%` stays as it is. Thus each topic of such a name stays the same.
 * - Before CLI-75, the plain topic kept a dotted name as it is: `collections.a.b` was the topic of
 *   the collection `a.b` and also of the partition `b` of `a`. Now the topic of `a.b` is
 *   `collections.a%2Eb`, so the two topics are not the same.
 * - Only the canonical form of a topic counts: a parse gives a collection and a partition only when
 *   `collectionChangeTopic(collection, partition)` gives the same topic. Thus `%2e` is no alias of
 *   `%2E`, and a rule or an `allow` function that compares the strings sees each topic one way.
 */
import { encodeSegment, decodeSegment } from "../segments.js";
import type { RepositoryProvider } from "../types.js";

/** The prefix of the topic of each collection. */
const PREFIX = "collections.";

/**
 * This function gives the topic of the change events of a collection: `collections.<name>`, or
 * `collections.<name>.<partition>` for a partition (roadmap CLI-17). The name encodes `%` and `.`
 * (roadmap CLI-42 and CLI-75), so `collectionTopicPartition()` gives back the same collection and
 * the same partition.
 *
 * @example
 * ```typescript
 * collectionChangeTopic("notes", "t1/board:b1"); // "collections.notes.t1/board:b1"
 * collectionChangeTopic("graph.nodes", "acme/space"); // "collections.graph%2Enodes.acme/space"
 * collectionChangeTopic("graph.nodes"); // "collections.graph%2Enodes"
 * ```
 */
export function collectionChangeTopic(collection: string, partition?: string): string {
  const name = `${PREFIX}${encodeSegment(collection)}`;
  return partition === undefined ? name : `${name}.${partition}`;
}

/**
 * This function gives the collection and the partition of a topic `collections.<name>` or
 * `collections.<name>.<partition>`, or undefined for another topic. A host reads the collection
 * of a topic with it, and not with its own pattern.
 *
 * - The first dot after the name ends the name. The name is decoded: `%2E` is a dot and `%25` is a
 *   `%` (roadmap CLI-42 and CLI-75).
 * - Each character after that dot is the partition. A partition has one character at least.
 * - A topic that is not in the canonical form gives undefined: `collectionChangeTopic()` of the
 *   result always gives the topic again. Thus `collections.a%2eb.t1` names no collection.
 * - For each name and each partition, `collectionTopicPartition(collectionChangeTopic(name,
 *   partition))` gives the same name and the same partition.
 *
 * @example
 * ```typescript
 * collectionTopicPartition("collections.e2e%2Etabs"); // { collection: "e2e.tabs", partition: undefined }
 * collectionTopicPartition("collections.e2e%2Etabs.t1"); // { collection: "e2e.tabs", partition: "t1" }
 * ```
 */
export function collectionTopicPartition(topic: string): { collection: string; partition: string | undefined } | undefined {
  if (!topic.startsWith(PREFIX)) return undefined;
  const rest = topic.slice(PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot === 0 || dot === rest.length - 1 || rest === "") return undefined;
  const collection = decodeSegment(dot === -1 ? rest : rest.slice(0, dot));
  const partition = dot === -1 ? undefined : rest.slice(dot + 1);
  // Only the canonical form counts: an alias of an escape names no collection
  return collectionChangeTopic(collection, partition) === topic ? { collection, partition } : undefined;
}

/**
 * This function gives the collection and the partition part of a topic of a call: one rule for
 * the read check and for the listener of the publisher. It gives the result of
 * `collectionTopicPartition()`.
 *
 * - Before CLI-75, a collection of the repository whose name was the whole rest of the topic won,
 *   because the plain topic of a dotted name did not encode the name. Now each topic encodes the
 *   name, so the function does not read the repository.
 *
 * @param repository - Deprecated: not used since roadmap CLI-75. The parameter stays for the
 *   callers, and a later MINOR removes it. (TSDoc has no `@deprecated` for one parameter, and the
 *   block tag would deprecate the whole function, which stays.)
 */
export function collectionTopicTarget(topic: string, repository: RepositoryProvider | undefined): { collection: string; partition: string | undefined } | undefined {
  void repository;
  return collectionTopicPartition(topic);
}

/**
 * This function gives the topic rule of a collection for `EventPublisher` (the option `topics`):
 * the topic of the collection, and the pattern of the topics of its partitions (roadmap CLI-42).
 * Build the rule of a collection with it. Do not join the parts yourself: a dotted name needs its
 * encoded form.
 *
 * - The rule always has the two forms. For a collection with partitions, the plain topic asks for
 *   no partition, and the resolver of the partition decides.
 * - For a collection without partitions, a topic of a partition passes the rule. The publisher then
 *   refuses it with `FORBIDDEN` (reason `partition-not-allowed`).
 * - The rule matches only the canonical form of a topic, so an alias of an escape gets
 *   `TOPIC_NOT_FOUND`.
 *
 * @example
 * ```typescript
 * collectionTopicRule("graph.nodes"); // ["collections.graph%2Enodes", "collections.graph%2Enodes.*"]
 * new EventPublisher({ bus, topics: ["orders.*", ...collectionTopicRule("graph.nodes")] });
 * ```
 */
export function collectionTopicRule(collection: string): string[] {
  const topic = collectionChangeTopic(collection);
  return [topic, `${topic}.*`];
}
