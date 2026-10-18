/**
 * The partitions of a collection (roadmap CLI-17). One `collections.<name>.*` surface serves the
 * items of several partitions, for example one per tenant, or one per tenant and scope. Each call
 * reads and writes one partition.
 *
 * - The input can ask for a partition (`partition`, for example a scope).
 * - The resolver of the procedures gives the partition of the call from its context: the tenant
 *   comes from the principal, never from the input alone. It can refuse the call.
 * - The repository gives the storage of the partition (`getPartitionStorage`). A repository without
 *   partitions refuses a call with a partition: it never gives the storage of all partitions.
 * - The change events of a partition go to the topic `collections.<name>.<partition>`.
 */
import type { ZodLike } from "../../client/validation/types.js";
import { InvocationError } from "../invoke.js";
import type { ProcedureContext } from "../types.js";
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
 */
export type PartitionResolver = (ctx: ProcedureContext, requested: string | undefined) => string | undefined | null | Promise<string | undefined | null>;

/**
 * This function adds the field `partition` to the input schema of a collection procedure. Without a
 * resolver (`allowed` false), an input with a partition is a validation error.
 */
export function withPartition<T>(schema: ZodLike<T>, allowed: boolean): ZodLike<T & PartitionInput> {
  const validate = (data: unknown): { success: true; data: T & PartitionInput } | { success: false; error: { message: string; errors: { path: (string | number)[]; message: string }[] } } => {
    const fail = (message: string) => ({ success: false as const, error: { message, errors: [{ path: ["partition"], message }] } });
    const requested = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>)["partition"] : undefined;
    if (requested !== undefined) {
      if (!allowed) return fail("This collection has no partitions");
      if (typeof requested !== "string" || !PARTITION_PATTERN.test(requested)) return fail("partition must have 1 to 256 letters, digits or the characters _ . : @ ~ + | / -");
    }
    const inner = schema.safeParse(data);
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

/** This function gives the partition of a call, or throws `FORBIDDEN` when the resolver refuses it. */
export async function partitionOfCall(resolver: PartitionResolver | undefined, ctx: ProcedureContext, requested: string | undefined): Promise<string | undefined> {
  if (!resolver) return undefined;
  const partition = await resolver(ctx, requested);
  if (partition === null) {
    throw new InvocationError("FORBIDDEN", `The call cannot use the partition${requested === undefined ? "" : ` "${requested}"`}`, ctx.path, "partition-not-allowed");
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
 * This function gives the partition of a topic `collections.<name>.<partition>`, or undefined for
 * another topic. A host can use it in the `allow` of its `EventPublisher` to keep each subscriber
 * in its partitions.
 */
export function collectionTopicPartition(topic: string): { collection: string; partition: string | undefined } | undefined {
  const match = /^collections\.([^.]+)(?:\.(.+))?$/.exec(topic);
  if (!match) return undefined;
  return { collection: match[1]!, partition: match[2] };
}
