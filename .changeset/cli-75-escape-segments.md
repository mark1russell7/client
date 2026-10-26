---
"@procedures/client": minor
"@procedures/peer": minor
"@procedures/store": minor
"@procedures/mark": minor
---

A path segment with a dot or a `%` comes back the same after a trip over the wire (roadmap CLI-75, decision D36).

Before, the method name of `["collections", "e2e.tabs", "find"]` was `collections.e2e.tabs.find`. The server read it back as four segments, so the call got `NOT_FOUND`. In this release, each segment encodes `%` as `%25` and then `.` as `%2E` before the join:

- `pathToMethod(["collections", "e2e.tabs", "find"])` gives `{ service: "collections.e2e%2Etabs", operation: "find" }`, and `methodToPath()` gives the same path again.
- `pathToKey()`, `keyToPath()`, the body path of an HTTP request and `server.call` use the same encoding.
- The topic of a collection without a partition encodes the name too: `collectionChangeTopic("e2e.tabs")` gives `collections.e2e%2Etabs`. The topic of a partition already encoded the name (roadmap CLI-42).
- The decode accepts `%2E` and `%2e`, and it keeps each other `%` sequence. A topic must have the canonical form.
- A segment without `.` and `%` keeps its text. Thus the method names and the topics of such names do not change.

The new exports `encodeSegment()`, `decodeSegment()`, `segmentsToTopic()` and `topicToSegments()` do the encoding. Use them. Do not join or split the segments yourself.

Two collections thus do not have the same topic, and `ProcedureServer` accepts a storage of `a.b` next to partitions of `a` (before, roadmap CLI-57 and CLI-70 refused the two together). `CollectionTopicCollisionError` is deprecated, and no server throws it. A later release removes it.

MINOR (breaking, pre-1.0): a name with `.` or `%` gets a new method name, a new registry key and a new topic. The MCP tool names do not change.

Migration:

- Upgrade the clients and the servers of a name with `.` or `%` together.
- A host whose `expose`, policy or limit pattern names such a path in text uses the encoded form, for example `collections.e2e%2Etabs.*`.
- An `mcpExclude` entry, an `expose` deny entry or a limit entry in the old raw form, for example `collections.e2e.tabs.drop`, does not match. The check compares the encoded key, so the procedure becomes visible, or the limit does not apply. Write each such entry in the encoded form, for example `collections.e2e%2Etabs.drop`.
- A subscriber of a dotted collection uses `collectionChangeTopic(name)`. The raw topic `collections.a.b` is the topic of the partition `b` of `a`.
- Graph: read the collection of a topic with `collectionTopicPartition(topic)`, not with a pattern, for example `/^collections\.([^.]+)\./`.
- The site, MiniMongo and jarvis: no change, if their collection names have no `.` and no `%`.
