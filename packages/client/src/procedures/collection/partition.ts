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
 * - A collection without partitions refuses a call or a topic with a partition.
 */
import type { ZodLike } from "../../client/validation/types.js";
import { InvocationError } from "../invoke.js";
import type { ProcedureContext, RepositoryProvider } from "../types.js";
import type { CollectionStorage } from "./storage.js";

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
    const requested = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>)["partition"] : undefined;
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
 * This function gives the collection and the partition part of a topic of a call, with the
 * repository of the call: one rule for the read check and for the listener of the publisher.
 *
 * - A collection of the repository without partitions whose name is the whole rest of the topic
 *   wins: its name can have a dot.
 * - Else the first part after `collections.` names the collection, and the rest is the partition
 *   that the call asks for. A collection with partitions has no dot in its name.
 */
export function collectionTopicTarget(topic: string, repository: RepositoryProvider | undefined): { collection: string; partition: string | undefined } | undefined {
  if (!topic.startsWith("collections.")) return undefined;
  const whole = topic.slice("collections.".length);
  if (whole !== "" && repository?.hasCollection(whole) && !repository.hasPartitions?.(whole)) return { collection: whole, partition: undefined };
  return collectionTopicPartition(topic);
}

/**
 * This function gives the collection and the partition part of a topic `collections.<name>` or
 * `collections.<name>.<partition>`, or undefined for another topic. It reads the topic alone:
 * `collectionTopicTarget` also knows the collections of a repository.
 */
export function collectionTopicPartition(topic: string): { collection: string; partition: string | undefined } | undefined {
  const match = /^collections\.([^.]+)(?:\.(.+))?$/.exec(topic);
  if (!match) return undefined;
  return { collection: match[1]!, partition: match[2] };
}
