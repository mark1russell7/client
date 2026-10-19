/**
 * The topics of the change events of a collection (roadmap CLI-15, CLI-17 and CLI-42). This module
 * has the one function that makes a topic and the one function that reads it. Each part of the
 * client that makes or reads the topic of a collection or of a partition uses them.
 *
 * - `collections.<name>` is the topic of a collection. The name stays as it is, also with a dot.
 * - `collections.<name>.<partition>` is the topic of a partition. In this form, the name encodes
 *   `%` as `%25` and `.` as `%2E`. Thus the first dot after `collections.` ends the name, and the
 *   partition after that dot can have each character, also `.`, `/` and `%`.
 * - The partition stays as it is, and so does a name without `.` and `%`. Thus each topic of a
 *   partition that a host had before CLI-42 stays the same.
 * - The topic of a collection whose name has a dot, `collections.a.b`, has the same form as the
 *   topic of the partition `b` of the collection `a`. Only the repository knows the collection, so
 *   `collectionTopicTarget()` decides with it.
 */

/** The prefix of the topic of each collection. */
const PREFIX = "collections.";

/** This function encodes the name of a collection for a topic with a partition: `%` and `.` become `%25` and `%2E`. */
function encodeTopicName(name: string): string {
  return name.replace(/[%.]/g, (char) => (char === "%" ? "%25" : "%2E"));
}

/** This function decodes the name of a topic with a partition. A `%` before other characters stays as it is. */
function decodeTopicName(segment: string): string {
  return segment.replace(/%(25|2[Ee])/g, (_sequence, code: string) => (code === "25" ? "%" : "."));
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
 * This function splits a topic `collections.<name>` or `collections.<name>.<rest>` at the first
 * dot after the name. It gives the decoded name and the rest, which can be empty. It gives
 * undefined for another topic and for an empty name.
 */
export function splitCollectionTopic(topic: string): { collection: string; partition: string | undefined } | undefined {
  if (!topic.startsWith(PREFIX)) return undefined;
  const rest = topic.slice(PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot === -1) return rest === "" ? undefined : { collection: rest, partition: undefined };
  if (dot === 0) return undefined;
  return { collection: decodeTopicName(rest.slice(0, dot)), partition: rest.slice(dot + 1) };
}

/**
 * This function gives the collection and the partition of a topic `collections.<name>` or
 * `collections.<name>.<partition>`, or undefined for another topic. It reads the topic alone:
 * `collectionTopicTarget()` also knows the collections of a repository.
 *
 * - The first dot after the name ends the name. In a topic with a partition, the name is decoded:
 *   `%2E` is a dot and `%25` is a `%` (roadmap CLI-42).
 * - Each character after that dot is the partition. A partition has one character at least.
 * - For each name and each partition, `collectionTopicPartition(collectionChangeTopic(name,
 *   partition))` gives the same name and the same partition.
 */
export function collectionTopicPartition(topic: string): { collection: string; partition: string | undefined } | undefined {
  const parts = splitCollectionTopic(topic);
  return parts === undefined || parts.partition === "" ? undefined : parts;
}
