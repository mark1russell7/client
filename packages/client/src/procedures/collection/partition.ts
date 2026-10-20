/**
 * The partitions of a collection (roadmap CLI-17). One `collections.<name>.*` surface serves the
 * items of several partitions, for example one per tenant, or one per tenant and scope. Each call
 * reads and writes one partition.
 *
 * - The host registers the partitions of a collection with its repository: the storage of each
 *   partition and the resolver (`ProcedureServer.usePartitions(name, { storageOf, resolve })`).
 * - The input of a call can ask for a partition (`partition`, for example a scope). The resolver
 *   gives the partition of the call from its context: the tenant comes from the principal, never
 *   from the input alone. It can refuse the call.
 * - A subscriber names the partition that it asks for in the topic, as an input does:
 *   `collections.<name>.<requested>`. The publisher resolves it in the same way and listens to the
 *   topic of the resolved partition, so a subscriber cannot name the topic of another tenant.
 * - In the topic of a partition, the name encodes `%` and `.` (`topic.ts`, roadmap CLI-42). Thus
 *   the name of a collection with partitions can have a dot.
 * - A collection without partitions refuses a call or a topic with a partition.
 * - The plain topic of a dotted name, `collections.a.b`, is also the topic of the partition `b` of
 *   `a`. Thus the server refuses a storage of `a.b` while `a` has partitions (roadmap CLI-57,
 *   decision D23).
 * - A collection `a.b` with partitions and no storage keeps its partitions next to `a`. When its
 *   resolver gives no partition, the publisher refuses a subscriber of `a.b` while `a` has
 *   partitions (roadmap CLI-70).
 */
import type { ZodLike } from "../../client/validation/types.js";
import { InvocationError } from "../invoke.js";
import type { ProcedureContext } from "../types.js";
import type { CollectionStorage } from "./storage.js";
import { collectionChangeTopic, collectionTopicPartition } from "./topic.js";

/** The characters of a partition: letters, digits and `_ . : @ ~ + | / -`, 256 at most. */
export const PARTITION_PATTERN: RegExp = /^[A-Za-z0-9_.:@~+|/-]{1,256}$/;

/** The field of an input that asks for a partition. */
export interface PartitionInput {
  partition?: string;
}

/**
 * The resolver of the partition of a call. It gets the context (with `ctx.principal`) and the
 * partition that the input asks for. It gives the partition, `undefined` for the storage of the
 * collection without a partition, or `null` to refuse the call (`FORBIDDEN`, reason
 * `partition-not-allowed`). An error that it throws passes through.
 *
 * The contract: the resolver gives a partition of the caller, or `null`. It never gives the
 * partition of another tenant. A resolver that maps a request of tenant B to the partition of
 * tenant A is a defect of the app: the events of A then reach B under the topic that B named, and
 * a `HybridStorage` of B keeps the items of A.
 */
export type PartitionResolver = (ctx: ProcedureContext, requested: string | undefined) => string | undefined | null | Promise<string | undefined | null>;

/**
 * This function adds the field `partition` to the input schema of a collection procedure. The
 * repository of the call decides at the call if the collection has partitions. The schema of the
 * operation does not get the field (CLI-46): a schema that checks each field of its input, for
 * example the schema of `find`, would refuse it. The parsed input gets it back.
 */
export function withPartition<T>(schema: ZodLike<T>): ZodLike<T & PartitionInput> {
  const validate = (data: unknown): { success: true; data: T & PartitionInput } | { success: false; error: { message: string; errors: { path: (string | number)[]; message: string }[] } } => {
    const fail = (message: string) => ({ success: false as const, error: { message, errors: [{ path: ["partition"], message }] } });
    // The partition is an own field of the input only, as withoutPartition() reads it
    const requested = typeof data === "object" && data !== null && !Array.isArray(data) && Object.prototype.hasOwnProperty.call(data, "partition")
      ? (data as Record<string, unknown>)["partition"]
      : undefined;
    if (requested !== undefined && (typeof requested !== "string" || !PARTITION_PATTERN.test(requested))) {
      return fail("partition must have 1 to 256 letters, digits or the characters _ . : @ ~ + | / -");
    }
    const inner = schema.safeParse(withoutPartition(data));
    if (!inner.success) return inner as { success: false; error: { message: string; errors: { path: (string | number)[]; message: string }[] } };
    const parsed = inner.data as T & PartitionInput;
    return { success: true, data: requested === undefined ? parsed : { ...parsed, partition: requested as string } };
  };
  return {
    parse(data: unknown) {
      const result = validate(data);
      if (result.success) return result.data;
      throw new Error(result.error.message);
    },
    safeParse: validate,
  } as ZodLike<T & PartitionInput>;
}

/** The input without its field `partition`: a copy of an object that has the field, else the input itself. */
function withoutPartition(data: unknown): unknown {
  if (typeof data !== "object" || data === null || Array.isArray(data) || !Object.prototype.hasOwnProperty.call(data, "partition")) return data;
  const { partition: _partition, ...rest } = data as Record<string, unknown>;
  return rest;
}

/** The partitions of a collection: the storage of each partition, and the resolver of a call. */
export interface CollectionPartitions<T = unknown> {
  /**
   * The storage of a partition. Give the same storage for the same partition each time: the change
   * events of a storage keep their order with it.
   */
  storageOf(partition: string): CollectionStorage<T>;
  /** The resolver of the partition of a call. */
  resolve: PartitionResolver;
}

/** The refusal of a partition. */
function partitionRefused(ctx: ProcedureContext, message: string): InvocationError {
  return new InvocationError("FORBIDDEN", message, ctx.path, "partition-not-allowed");
}

/**
 * This function gives the partition of a call to a collection: the resolver of the repository
 * gives it from the context and the requested partition. It throws `FORBIDDEN` (reason
 * `partition-not-allowed`) when the resolver refuses, or when the collection has no partitions and
 * the call asks for one.
 */
export async function partitionOfCall(ctx: ProcedureContext, collection: string, requested: string | undefined): Promise<string | undefined> {
  const repository = ctx.repository;
  if (!repository?.hasPartitions?.(collection) || !repository.resolvePartition) {
    if (requested !== undefined) throw partitionRefused(ctx, `The collection ${collection} has no partitions`);
    return undefined;
  }
  const partition = await repository.resolvePartition(collection, ctx, requested);
  if (partition === null) {
    throw partitionRefused(ctx, `The call cannot use the partition${requested === undefined ? "" : ` "${requested}"`} of ${collection}`);
  }
  if (partition !== undefined && !PARTITION_PATTERN.test(partition)) {
    throw new Error(`The partition resolver gave a partition that is not valid: ${JSON.stringify(partition).slice(0, 80)}`);
  }
  return partition;
}

/**
 * This function gives the storage of a call: of the collection, or of its partition. A repository
 * without `getPartitionStorage` refuses a partition.
 */
export function storageOfCall<T>(ctx: ProcedureContext, collection: string, partition: string | undefined): CollectionStorage<T> {
  const repository = ctx.repository;
  if (!repository) throw new Error("Repository not available in procedure context");
  if (partition === undefined) return repository.getStorage<T>(collection);
  if (!repository.getPartitionStorage) {
    throw new Error(`The repository has no partitions, so it cannot give the partition "${partition}" of ${collection}`);
  }
  return repository.getPartitionStorage<T>(collection, partition);
}

/**
 * The error of a server that serves two collections with the same topic (roadmap CLI-57, decision
 * D23). The plain topic of a collection with a storage, `collections.a.b`, is also the topic of the
 * partition `b` of the partitioned collection `a`. Thus the readers of `a.b` get the events of the
 * tenant `b` of `a`. To correct it, rename the collection `a.b` to a name without the prefix `a.`.
 */
export class CollectionTopicCollisionError extends Error {
  override readonly name = "CollectionTopicCollisionError";
  /** The collection with a storage without a partition. Its topic is `collections.<collection>`. */
  readonly collection: string;
  /** The collection with partitions. */
  readonly partitioned: string;
  /** The partition of `partitioned` whose topic is the topic of `collection`. */
  readonly partition: string;
  /** The topic of the two. */
  readonly topic: string;

  constructor(collection: string, partitioned: string, partition: string) {
    super(collisionMessage(collection, partitioned, partition));
    this.collection = collection;
    this.partitioned = partitioned;
    this.partition = partition;
    this.topic = collectionChangeTopic(collection);
  }
}

/** The message of a `CollectionTopicCollisionError`: the two collections, the topic and the fix. */
function collisionMessage(collection: string, partitioned: string, partition: string): string {
  // The plain name is the encoded name of the partitioned collection, a dot and the partition
  const prefix = collection.slice(0, collection.length - partition.length);
  return (
    `The collection "${collection}" and the partition "${partition}" of the collection "${partitioned}" have the same topic "${collectionChangeTopic(collection)}", ` +
    `so the readers of "${collection}" get the events of that partition (roadmap CLI-57). ` +
    `Rename the collection "${collection}" to a name that does not start with "${prefix}", for example "${collection.replace(/\./g, "_")}".`
  );
}

/**
 * This function gives the partition whose topic is the plain topic of a collection, or undefined
 * (roadmap CLI-57). The plain topic of `a.b` is `collections.a.b`, the topic of the partition `b`
 * of `a`. A name without a dot gives undefined. It uses the parse of the publisher, so the two agree.
 *
 * @example
 * ```typescript
 * partitionOfPlainTopic("a.b.c"); // { collection: "a", partition: "b.c" }
 * partitionOfPlainTopic("a%2Eb.c"); // { collection: "a.b", partition: "c" }
 * partitionOfPlainTopic("ab"); // undefined
 * ```
 */
export function partitionOfPlainTopic(collection: string): { collection: string; partition: string } | undefined {
  const target = collectionTopicPartition(collectionChangeTopic(collection));
  return target?.partition === undefined ? undefined : { collection: target.collection, partition: target.partition };
}

/**
 * This function refuses two collections with the same topic (roadmap CLI-57, decision D23). It
 * examines each collection with a storage: its plain topic must not be the topic of a partition of
 * a collection with partitions. `ProcedureServer` uses it for each new storage and for each new
 * collection with partitions, in each order.
 *
 * @param plain - The collections with a storage without a partition
 * @param hasPartitions - True for a collection with partitions
 * @throws CollectionTopicCollisionError for the first pair with the same topic
 */
export function assertTopicsApart(plain: Iterable<string>, hasPartitions: (collection: string) => boolean): void {
  for (const collection of plain) {
    const shared = partitionOfPlainTopic(collection);
    if (shared && hasPartitions(shared.collection)) throw new CollectionTopicCollisionError(collection, shared.collection, shared.partition);
  }
}

/**
 * This function gives the check of a subscriber that listens to the plain topic of a collection
 * (roadmap CLI-70, decision D23). When no partition has that topic, it gives undefined. The check
 * throws `FORBIDDEN` (reason `partition-not-allowed`) while the repository of the call gives
 * partitions to the collection of that partition.
 *
 * - The plain topic of `a.b` is also the topic of the partition `b` of `a`. Thus a subscriber of
 *   that topic gets the events of the partition `b` of `a`.
 * - `ProcedureServer` refuses a storage of `a.b` while `a` has partitions (roadmap CLI-57). A
 *   collection `a.b` with partitions and no storage passes that check. When its resolver gives no
 *   partition, a subscriber of `a.b` listens to the plain topic. This check refuses it.
 * - `EventPublisher` does the check at the start of a subscription, at each re-check and before
 *   each event. Thus partitions of `a` that come later also end the subscription.
 *
 * @param ctx - The context of the subscription: the check reads its repository each time
 * @param collection - The collection whose plain topic the subscriber listens to
 */
export function plainTopicCheck(ctx: ProcedureContext, collection: string): (() => void) | undefined {
  const shared = partitionOfPlainTopic(collection);
  if (!shared) return undefined;
  return () => {
    if (!ctx.repository?.hasPartitions?.(shared.collection)) return;
    throw partitionRefused(
      ctx,
      `The call has no partition of ${collection}, and the plain topic "${collectionChangeTopic(collection)}" is also the topic of the partition "${shared.partition}" of ${shared.collection} (roadmap CLI-70)`,
    );
  };
}

// The parse of a topic lives in topic.ts, with the encode (roadmap CLI-42)
export { collectionTopicPartition, collectionTopicTarget } from "./topic.js";
