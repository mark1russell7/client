/**
 * Materialized views driven by change streams (Graph's split plan, part P4). A view is a document
 * of a views collection: an aggregation pipeline over source collections whose result goes into a
 * target collection, for one partition (for example one tenant). The materializer runs each view
 * when its sources change, and keeps the target equal to the result of the pipeline.
 *
 * - The views of a partition run in the order of their dependencies: a view whose target is the
 *   source of another view runs first, in the same pass. A view in a cycle does not run, and its
 *   status is `cycle`.
 * - A pass runs after the last change of a burst (`debounce`), and only the views whose sources
 *   changed. A run streams the result in groups, and compares each row with the hash that its
 *   stored row keeps. A result that did not change writes nothing.
 * - The rows of a view are a generation (the field `_viewGen`), and the status of the view names
 *   the current one. A reader filters with `viewFilter(view)`, and thus always reads one whole
 *   generation.
 * - A run writes in one transaction: the rows that changed, in the current generation, and the
 *   removal of the rows that the result does not have. A view with more rows than
 *   `maxTransactionRows`, or whose transaction fails (for example over the limits of MongoDB),
 *   writes a whole new generation in groups instead. Then the status names it, and the previous
 *   generation stays for `generationGrace` (on the time of the server), so a reader of it can finish.
 * - A pass in groups holds a lease on its view (`passLease`, on the time of the server), and renews
 *   it after each group. Another process leaves the view and the rows of that generation alone while
 *   the lease holds. The change to the new generation is a compare-and-set: it needs the lease, and
 *   the generation that the pass started from. A pass that loses either one gives way: its rows go
 *   in a later pass, and a new pass of the view follows.
 * - The stored `_id` of a row carries the partition and the generation (`targetId`): partitions
 *   with the same keys share a target. The rows of an older materializer (no generation) go in the
 *   first pass.
 * - Each pipeline goes through the guard of the scope (`scopePipeline` by default): it reads only
 *   the documents of its partition, in its sources, and only the current generation of a target
 *   of another view. The materializer writes the rows.
 * - A pass keeps in memory the key of each row of the result (at most `maxRows`) and one group of
 *   1000 rows. It keeps nothing between passes.
 * - A change stream that ends (for example after `dropDatabase`) opens again after `rewatch`,
 *   and a pass catches up on the changes that the stream missed.
 * - Each stream is open on the server before the materializer reads what it watches: the views
 *   before the read of the views, the sources before a run. A change between the two reaches both.
 * - The status of each view (`ok`, `errored`, `cycle`) goes into the field `statusField` of its
 *   document. The materializer ignores an update of only that field.
 *
 * A change reaches only the views of its partition when its partition is known. A delete has no
 * document: its partition comes from the pre-image (a collection with
 * `changeStreamPreAndPostImages`), or, in a source of `storageSources`, from `partitionOf` of the
 * stored form and the mapping of the source (roadmap CLI-76). Else it reaches the views of each
 * partition of its source. With pre-images, an update
 * that moves a document to another partition also reaches the views of its old partition.
 *
 * Change streams and transactions need a replica set (MongoDB 6 or later). The target of a view is
 * a plain collection that only the materializer writes. A target of `storageTargets` is in the
 * stored form of a `MongoDocumentStorage` instead (roadmap CLI-81): see `ViewStorageTarget`.
 *
 * The stop has the parts of a transport of a service: `stopIntake()`, `drain()`, `inFlight()` and
 * `close()`. A host composes them with no adapter. The timers come from the injected clock.
 */

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { BSON, ObjectId, type AnyBulkWriteOperation, type ChangeStream, type ClientSession, type Collection, type Db, type Document } from "mongodb";
import { collectionChangeTopic, ms, optionalMs, realClock, type Cancel, type Clock, type CollectionChangeEvent, type Duration } from "@procedures/client";
import { DEFAULT_STORED_FORM, DOCUMENT_STORAGE_FIELDS, MongoDocumentStorage, TOMBSTONE_FIELD, storageWriteTarget, type StorageWriteTarget, type StoredForm } from "./document-storage.js";
import { scopePipeline } from "./pipeline-scope.js";
import type { StorageHintPublisher } from "./storage-hints.js";

/** The fields of a storage that a row never keeps: its sequence number and its tombstone flag (roadmap CLI-77). */
const ROW_DROPPED_FIELDS = ["_seq", TOMBSTONE_FIELD] as const;

/** The definition of a view, as a document of the views collection. */
export interface MaterializedView {
  _id: string;
  /** The source collections. The pipeline runs on the first one, and reads the others with `$lookup` or `$unionWith`. */
  collections: string[];
  /** The aggregation pipeline, without `$merge`. */
  pipeline: Document[];
  /** The collection that gets the result. */
  targetCollection: string;
  /**
   * The fields that the pipeline reads, for each source (paths with dots). An update of a source
   * that changes none of them (a set, a removal, a truncated array, at the field, under it or above
   * it), and does not change the partition field, does not start a pass. Without it, each update of
   * the source starts a pass.
   */
  sourceFields?: Record<string, string[]>;
  [field: string]: unknown;
}

/** The status of a view, in the field `statusField` of its document. */
export interface MaterializedViewStatus {
  state: "ok" | "errored" | "cycle";
  lastError?: string;
  /** The time of the status, in milliseconds since the epoch. */
  at: number;
  /** The current generation of the rows of the view. */
  generation?: ObjectId;
  /** The generation before the last change of generation, and the time of that change on the server (`$$NOW`). */
  previous?: { generation: ObjectId | null; flippedAt: Date };
  /** The lease of a pass in groups: its owner, the generation that it writes, and its end on the server. */
  lease?: { owner: string; generation: ObjectId; until: Date };
}

/**
 * The function that guards the pipeline of a view for its partition. `match` is the filter of the
 * documents that the pipeline can read: the partition, and the current generations of the targets.
 */
export type ViewPipelineScope = (pipeline: Document[], partition: string, view: MaterializedView, match: Document) => Document[];

/** The options of a `ViewMaterializer`. */
export interface ViewMaterializerOptions {
  /** The database of the views, the sources and the targets. */
  db: () => Db | Promise<Db>;
  /** The collection of the view documents (default `_aggregations`). */
  views?: string | undefined;
  /** The field of a document that names its partition (default `_part`). The views and the source documents have it. */
  partitionField?: string | undefined;
  /** The field of a view document that gets its status (default `_materializerStatus`). */
  statusField?: string | undefined;
  /**
   * The guard of a pipeline. The default is `scopePipeline` with `match` as the filter and the
   * sources as the collections. Another guard applies `match` to each collection too.
   */
  scope?: ViewPipelineScope | undefined;
  /** The time after the last change before a pass (default 100 ms). */
  debounce?: Duration | undefined;
  /** The time before a change stream that ended opens again (default 1 s). */
  rewatch?: Duration | undefined;
  /** The longest time of a pipeline (default 30 s). */
  maxTime?: Duration | undefined;
  /** The most rows of the result of a view (default 100000). A larger result is an error of the view. */
  maxRows?: number | undefined;
  /** The log (default `console`, with the prefix `[materializer]`). */
  log?: ((level: "info" | "warn" | "error", message: string) => void) | undefined;
  /** The clock of the timers (default the clock of the platform). A test gives a fake clock. The timers do not keep a process alive. */
  clock?: Clock | undefined;
  /**
   * The stored `_id` of a row of a view, from the `_id` of the row, the partition and the
   * generation (default `partitionTargetId`: `{ partition, generation, id }`). Two partitions, or two
   * generations, must not give the same stored `_id`. The write of a row checks the partition, and
   * fails on the row of another partition. A pass in groups fails when the generation does not
   * change the `_id`.
   */
  targetId?: ViewTargetId | undefined;
  /** A view with more rows than this writes a new generation in groups, not in one transaction (default 10000). */
  maxTransactionRows?: number | undefined;
  /**
   * The time that the previous generation stays after a change of generation (default 60 s). The
   * time of the server (`$$NOW`) measures it, so the processes and the restarts agree.
   */
  generationGrace?: Duration | undefined;
  /**
   * The lease of a pass in groups on its view (default 60 s), on the time of the server. The pass
   * renews it after each group, so a group must take less time.
   */
  passLease?: Duration | undefined;
  /**
   * The sources that are collections of a `MongoDocumentStorage`. For each one, a function that
   * gives the partition of the views from the partition of the storage (the storage has the default
   * form), or a `ViewStorageSource` with the stored form of the storage (`storage.form`) and that
   * function. A change without a pre-image then reaches only the views of its partition: the
   * `partitionOf` of the form reads the storage partition from the document of the change (for a
   * delete, only `documentKey`). Give `identityPartition` when the two partitions are the same.
   * When the form or the function gives `undefined`, the change reaches the views of each partition.
   */
  storageSources?: Readonly<Record<string, ViewPartitionOf | ViewStorageSource>> | undefined;
  /**
   * The targets in the stored form of a `MongoDocumentStorage` (roadmap CLI-81), by the name of the
   * target collection: the storage of the target, its stored form, or a `ViewStorageTarget`. The
   * rows of such a target are documents of the storage, so a reader reads them through a
   * `MongoDocumentStorage` with the same form, and `changes(since)` and `watchStorageChanges()`
   * have each write of a run. See `ViewStorageTarget` for the rules. Give the same targets to each
   * materializer of the views.
   *
   * A function gives the entry of a target collection at each run, or undefined for a target that
   * is not in a stored form: an app can name its targets at run time. The materializer keeps the
   * storage that it makes for a collection while the entry gives the same form, counters,
   * `writeLease` and `maxTombstones`. An error of the function is an error of the view.
   */
  storageTargets?: Readonly<Record<string, ViewStorageTargetEntry>> | ((collection: string) => ViewStorageTargetEntry | undefined) | undefined;
  /**
   * The id of a row of a target in a stored form, from the `_id` of the row in the result. It must
   * give a text, and give the same text for the same `_id` at each run.
   * @default `defaultStorageRowId`: a text as it is, another value as its relaxed Extended JSON text
   */
  storageRowIdOf?: ((id: unknown) => string) | undefined;
  /**
   * The publisher of the hints of the targets that are not in `storageTargets`, for example the bus
   * of the procedures. After each run that changes rows, the materializer publishes one hint with
   * the ids of the changed rows and of the removed rows. A change of generation, a row id that is
   * not a text and more than 10000 ids give a reset hint (`reset: true`): the subscribers read the
   * view in full. The materializer publishes no hint of a target in a stored form: a watcher of
   * the storage (`watchStorageChanges()`) does.
   */
  publish?: StorageHintPublisher | undefined;
  /** The topic of the hints of a view, or undefined for no hint (default `collectionChangeTopic(view._id)`). */
  hintTopic?: ((view: MaterializedView, partition: string) => string | undefined) | undefined;
  /**
   * The `_id` of a row in the result, from its stored `_id`, for the ids of a hint. It reverses
   * `targetId`. The default reads the field `id` of the form of `partitionTargetId`.
   */
  rowIdOf?: ((storedId: unknown) => unknown) | undefined;
}

/**
 * A storage with items of any type. The type of the items does not change the stored form, and a
 * `MongoDocumentStorage<T>` of a given `T` is not a `MongoDocumentStorage<unknown>`.
 */
type AnyDocumentStorage = MongoDocumentStorage<any>;

/** An entry of `storageTargets`: the storage of a target, its stored form, or a `ViewStorageTarget`. */
export type ViewStorageTargetEntry = AnyDocumentStorage | StoredForm | ViewStorageTarget;

/**
 * A target of `storageTargets` (roadmap CLI-81).
 *
 * - The rows are documents of the storage: each row gets `_key`, `_seq`, `_ord`, the partition
 *   fields of the form, and `_kid`, `_kpf` or `_json` as a write of the storage makes them. The
 *   materializer encodes each row from its own content: the fields of a storage in a row (for
 *   example of a source document that the pipeline passes through) do not go into the target.
 * - The id of a row is `storageRowIdOf(_id)`: by default the `_id` of the row when it is a text,
 *   else its relaxed Extended JSON text (`null` gives `"null"`, `5` gives `"5"`, an ObjectId gives
 *   `{"$oid":"…"}`). The item has that id as its `_id`. Two rows of a result must not have the
 *   same id.
 * - A row also gets the partition field of the materializer with the partition of the view, so a
 *   view that reads the target finds it. When that field is a partition field of the form, the
 *   form must give it the partition of the view.
 * - A run takes the numbers of its writes from the sequence of the storage, and a late run moves
 *   to new numbers, as a write of the storage does. A removed row becomes a tombstone, and the
 *   prune of the tombstones raises the floor of the change log.
 * - A partition of the storage holds only the rows of one view. The run makes a tombstone of each
 *   other live document in that partition. The materializer refuses a second view of the same
 *   target collection and partition of the storage: that view has an error.
 * - The materializer gives the target no images before the change. Turn on
 *   `changeStreamPreAndPostImages` on the target when raw hard deletes can occur.
 * - The rows have no generation, so `viewFilter()` and a `MongoViewStorage` do not read them.
 */
export interface ViewStorageTarget {
  /** The storage of the target, or its stored form. The materializer writes with its own database, and takes the counters, `writeLease` and `maxTombstones` of a storage. */
  target: AnyDocumentStorage | StoredForm;
  /** The partition of the storage from the partition of a view (default the same partition). Undefined is the storage without a partition. */
  storagePartitionOf?: ((viewPartition: string) => string | undefined) | undefined;
}

/** The function that gives the stored `_id` of a row of a view. */
export type ViewTargetId = (id: unknown, partition: string, generation: ObjectId) => unknown;

/** The stored `_id` of a row: `{ partition, generation, id }`. A reader reads the key of the row in `_id.id`. */
export const partitionTargetId: ViewTargetId = (id, partition, generation) => ({ partition, generation, id });

/** The field of a row of a view that names its generation. */
export const VIEW_GENERATION_FIELD = "_viewGen";
/** The field of a row of a view that keeps the hash of its content. */
export const VIEW_HASH_FIELD = "_viewHash";

/**
 * The filter of the rows of a view for a reader: its partition and its current generation. A
 * reader of a target applies it, so it reads one whole generation. Before the first run, it
 * matches no row.
 */
export function viewFilter(view: MaterializedView, options: { partitionField?: string | undefined; statusField?: string | undefined } = {}): Document {
  const partitionField = options.partitionField ?? "_part";
  const status = view[options.statusField ?? "_materializerStatus"] as Partial<MaterializedViewStatus> | undefined;
  return { [partitionField]: view[partitionField], [VIEW_GENERATION_FIELD]: status?.generation ?? { $in: [] } };
}

/** An error of the result of a view (the pipeline, the size, a row): a pass in groups gives it too. */
class ViewRunError extends Error {}

/** A pass that another process supersedes (its lease, or a newer generation): it gives way, with no error of the view. */
class PassSuperseded extends Error {}

/**
 * True for a write conflict with another process (code 112). The label `TransientTransactionError`
 * is not enough: a transaction over its lifetime limit has it too, and that view goes in groups.
 */
function isWriteConflict(error: unknown): boolean {
  const value = error as { code?: unknown; codeName?: unknown } | null;
  return value?.code === 112 || value?.codeName === "WriteConflict";
}

/** A row of the result, ready to store. */
interface StoredRow {
  /** The `_id` of the row in the result. */
  id: unknown;
  key: string;
  hash: string;
  doc: Document;
}

/** The writes of a run go to the server in groups of this size. */
const WRITE_GROUP = 1000;

function groups<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += WRITE_GROUP) result.push(items.slice(start, start + WRITE_GROUP));
  return result;
}

/** The most tries of a run in a transaction after a write conflict (code 112). After them, the run gives way, and comes back after `rewatch`. */
const CONFLICT_RETRIES = 3;

/** The most ids of a hint of a target not in a stored form. More ids give a reset hint. */
const MAX_HINT_IDS = 10_000;

/** The `_id` of a row in the result, from the stored `_id` of `partitionTargetId`. */
export function defaultRowId(storedId: unknown): unknown {
  return typeof storedId === "object" && storedId !== null && "id" in storedId ? (storedId as { id: unknown }).id : storedId;
}

/**
 * The id of a row of a target in a stored form, from the `_id` of the row in the result: a text as
 * it is, another value as its relaxed Extended JSON text. The text of a value is the same at each
 * run (the order of the fields of an object is the order of the result). A row without `_id` has
 * no id.
 */
export function defaultStorageRowId(id: unknown): string {
  if (typeof id === "string") return id;
  if (id === undefined) throw new TypeError("the row has no _id");
  return BSON.EJSON.stringify(id as Document, { relaxed: true });
}

/** The hash of a stored document without its numbers (`_seq` and `_ord`): two documents with the same content give the same hash. */
function contentHash(doc: Document): string {
  const { _seq: _number, _ord: _place, ...rest } = doc;
  return createHash("sha1")
    .update(canonical(BSON.EJSON.serialize(rest, { relaxed: false })))
    .digest("hex");
}

/** The values of a target in a stored form that make its storage. */
interface StorageTargetValues {
  readonly form: StoredForm;
  readonly counters: string | undefined;
  readonly writeLeaseMs: number | undefined;
  readonly maxTombstones: number | undefined;
}

/** A target of `storageTargets`, ready to write: a storage on the database of the materializer. */
interface StorageTargetEntry {
  readonly storage: MongoDocumentStorage<unknown>;
  readonly storagePartitionOf: (viewPartition: string) => string | undefined;
}

/** The storage of the partition of a view in its target (roadmap CLI-81). */
interface TargetPartition {
  readonly writer: StorageWriteTarget;
  /** The filter of the rows of the view: the partition of the storage and the partition of the view. */
  readonly filter: Document;
  /** True when the partition field of the materializer goes in the content of an item (not a field of the storage or of the form). */
  readonly partitionInContent: boolean;
}

/** A row of a target in a stored form that a run writes, with the place of its stored document (`_ord`) when it has one. */
interface StorageWrite {
  readonly row: StoredRow;
  readonly ord: number | undefined;
}

/** A row of a target in a stored form that a run removes: its stored `_id`, and its id when the stored document tells one that the result does not have. */
interface StorageRemoval {
  readonly storedId: unknown;
  readonly id: string | undefined;
}

/** The function that gives the partition of the views from the partition of a storage, or `undefined` when it does not know. */
export type ViewPartitionOf = (storagePartition: string) => string | undefined;

/** The partition of the views is the partition of the storage. */
export const identityPartition: ViewPartitionOf = (storagePartition) => storagePartition;

/** A source of `storageSources` with its stored form (roadmap CLI-76). */
export interface ViewStorageSource {
  /** The stored form of the storage, for example `storage.form`. Its `partitionOf` reads the storage partition of a document. */
  form: Pick<StoredForm, "partitionOf">;
  /** The partition of the views from the partition of the storage. */
  viewPartitionOf: ViewPartitionOf;
}

/**
 * This function waits until a change stream is open on the server: its first resume token. From
 * then on, the stream gets each change. The driver sends the `aggregate` of a stream only after
 * `watch()` returns, so a change before that point does not reach the stream. An error, an end or a
 * close of the stream also ends the wait: its rewatch catches up (roadmap O63).
 */
function openOnServer(stream: ChangeStream): Promise<void> {
  return new Promise((resolve) => {
    const events = ["resumeTokenChanged", "error", "end", "close"] as const;
    const done = (): void => {
      for (const event of events) stream.off(event, done);
      resolve();
    };
    for (const event of events) stream.on(event, done);
  });
}

/** A view that the materializer knows. */
interface RunningView {
  view: MaterializedView;
  partition: string;
  /** `active`: its streams are open, and it runs in the passes. `cyclic`: it is in a cycle, and it waits. */
  state: "active" | "cyclic";
  streams: ChangeStream[];
}

/** A path without its positions in arrays (the segments of digits only): `lines.0.price` gives `lines.price`. */
function withoutPositions(path: string): string {
  return path
    .split(".")
    .filter((segment) => !/^\d+$/.test(segment))
    .join(".");
}

/** The key of a row id for the signatures: type-aware, so an ObjectId and its text are different keys. */
function idKey(id: unknown): string {
  return BSON.EJSON.stringify({ id }, { relaxed: false });
}

/** A text of a value with sorted keys: two objects with the same fields give the same text. */
function canonical(value: unknown): string {
  if (value === null || value === undefined || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

/**
 * A `ViewMaterializer` keeps the target of each view equal to the result of its pipeline.
 *
 * @example
 * ```typescript
 * const views = new ViewMaterializer({ db: () => client.db("app"), partitionField: "tenant" });
 * await views.start();
 * // ... later
 * await views.stop();
 * ```
 */
export class ViewMaterializer {
  private readonly options: ViewMaterializerOptions;
  private readonly viewsName: string;
  private readonly partitionField: string;
  private readonly statusField: string;
  private readonly debounceMs: number;
  private readonly rewatchMs: number;
  private readonly maxTimeMS: number;
  private readonly maxRows: number;
  private db: Db | undefined;
  private viewsStream: ChangeStream | undefined;
  private readonly running = new Map<string, RunningView>();
  /** The collections that changed since the last pass, for each partition. */
  private readonly dirty = new Map<string, Set<string>>();
  private readonly timers = new Map<string, Cancel>();
  /** The timers of the streams that open again, and of the ends of the grace times. */
  private readonly retries = new Set<Cancel>();
  private readonly clock: Clock;
  private readonly targetId: ViewTargetId;
  private readonly maxTransactionRows: number;
  private readonly graceMs: number;
  private readonly leaseMs: number;
  private readonly storageSources: ReadonlyMap<string, ViewStorageSource>;
  /** The storages that the materializer made for the targets in a stored form, by collection, with the values that made them. */
  private readonly storageTargetCache = new Map<string, StorageTargetValues & { storage: MongoDocumentStorage<unknown> }>();
  /** The partition of a storage target that each running view writes (by the key of the view), so a second view of it is refused. */
  private readonly storageClaims = new Map<string, { claim: string; view: string; partition: string }>();
  private readonly storageRowIdOf: (id: unknown) => string;
  private readonly rowIdOf: (storedId: unknown) => unknown;
  /** False after `stopIntake()`: a change starts no pass. */
  private intake = false;
  /** The work of each partition, one at a time: the passes and the rebalances. */
  private readonly chains = new Map<string, Promise<void>>();
  private readonly pending = new Set<Promise<unknown>>();
  /** The changes of the set of views (a resync, a change of a view document), one at a time, in the order of the views stream. */
  private viewChain: Promise<unknown> = Promise.resolve();
  private stopped = true;

  constructor(options: ViewMaterializerOptions) {
    this.options = options;
    this.viewsName = options.views ?? "_aggregations";
    this.partitionField = options.partitionField ?? "_part";
    this.statusField = options.statusField ?? "_materializerStatus";
    this.debounceMs = optionalMs(options.debounce, "debounce") ?? 100;
    this.rewatchMs = optionalMs(options.rewatch, "rewatch") ?? 1000;
    this.maxTimeMS = optionalMs(options.maxTime, "maxTime") ?? 30_000;
    this.maxRows = options.maxRows ?? 100_000;
    this.clock = options.clock ?? realClock;
    this.targetId = options.targetId ?? partitionTargetId;
    this.maxTransactionRows = options.maxTransactionRows ?? 10_000;
    this.graceMs = optionalMs(options.generationGrace, "generationGrace") ?? 60_000;
    this.leaseMs = Math.round(optionalMs(options.passLease, "passLease") ?? 60_000);
    this.storageSources = new Map(
      Object.entries(options.storageSources ?? {}).map(([source, entry]): [string, ViewStorageSource] => {
        const normal = typeof entry === "function" ? { form: DEFAULT_STORED_FORM, viewPartitionOf: entry } : entry;
        if (typeof normal?.form?.partitionOf !== "function" || typeof normal.viewPartitionOf !== "function") {
          throw new TypeError(`The storage source ${source} needs a function, or a form with partitionOf and a viewPartitionOf`);
        }
        return [source, normal];
      })
    );
    // A record of targets is examined at once: a wrong entry is an error of the options
    const targets = options.storageTargets;
    if (targets !== undefined && typeof targets !== "function") {
      for (const [collection, entry] of Object.entries(targets)) this.storageTargetOf(collection, entry);
    }
    this.storageRowIdOf = options.storageRowIdOf ?? defaultStorageRowId;
    this.rowIdOf = options.rowIdOf ?? defaultRowId;
  }

  /**
   * A target of `storageTargets` as a storage on the database of the materializer, so its writes
   * and the transaction of a run use one client. A given storage gives its form, its counters,
   * `writeLease` and `maxTombstones`.
   */
  private storageTargetOf(collection: string, entry: ViewStorageTargetEntry): StorageTargetEntry {
    const wrapped = typeof entry === "object" && entry !== null && "target" in entry ? entry : { target: entry };
    const storagePartitionOf = wrapped.storagePartitionOf ?? ((partition: string): string | undefined => partition);
    if (typeof storagePartitionOf !== "function") throw new TypeError(`The storage target ${collection} needs a function storagePartitionOf`);
    const target = wrapped.target;
    let values: StorageTargetValues;
    if (target instanceof MongoDocumentStorage) {
      const parts = storageWriteTarget(target);
      if (parts.collection !== collection) throw new TypeError(`The storage target ${collection} has a storage of the collection ${parts.collection}`);
      values = { form: parts.form, counters: parts.counters, writeLeaseMs: parts.writeLeaseMs, maxTombstones: parts.maxTombstones };
    } else if (typeof target === "object" && target !== null && typeof (target as Partial<StoredForm>).storedId === "function") {
      values = { form: target as StoredForm, counters: undefined, writeLeaseMs: undefined, maxTombstones: undefined };
    } else {
      throw new TypeError(`The storage target ${collection} needs a MongoDocumentStorage, a stored form or a ViewStorageTarget`);
    }
    // The same values give the storage of the last run: its partitions keep their state (the floor document of O66)
    const cached = this.storageTargetCache.get(collection);
    if (cached && cached.form === values.form && cached.counters === values.counters && cached.writeLeaseMs === values.writeLeaseMs && cached.maxTombstones === values.maxTombstones) {
      return { storage: cached.storage, storagePartitionOf };
    }
    const db = (): Db => {
      if (!this.db) throw new Error("The materializer has not started");
      return this.db;
    };
    const storage = new MongoDocumentStorage<unknown>({
      collection,
      db,
      form: values.form,
      transactions: "never",
      ...(values.counters !== undefined ? { counters: values.counters } : {}),
      ...(values.writeLeaseMs !== undefined ? { writeLease: ms(values.writeLeaseMs) } : {}),
      ...(values.maxTombstones !== undefined ? { maxTombstones: values.maxTombstones } : {}),
    });
    this.storageTargetCache.set(collection, { ...values, storage });
    return { storage, storagePartitionOf };
  }

  /** The target in a stored form of a collection at this time, or undefined. The function of `storageTargets` runs at each call. */
  private storageTargetFor(collection: string): StorageTargetEntry | undefined {
    const targets = this.options.storageTargets;
    if (targets === undefined) return undefined;
    const entry = typeof targets === "function" ? targets(collection) : Object.hasOwn(targets, collection) ? targets[collection] : undefined;
    return entry === undefined || entry === null ? undefined : this.storageTargetOf(collection, entry);
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    if (this.options.log) this.options.log(level, message);
    else console[level === "info" ? "log" : level](`[materializer] ${message}`);
  }

  /**
   * The guard of a pipeline of a view. A target of another view counts only in its current
   * generation. A source document has no generation. A tombstone of a `MongoDocumentStorage` (a
   * deleted item) is not a row of a source (roadmap CLI-79).
   */
  private scoped(pipeline: Document[], partition: string, view: MaterializedView, generations: readonly ObjectId[]): Document[] {
    const match = {
      [this.partitionField]: partition,
      [TOMBSTONE_FIELD]: { $ne: true },
      $or: [{ [VIEW_GENERATION_FIELD]: { $exists: false } }, { [VIEW_GENERATION_FIELD]: { $in: [...generations] } }],
    };
    if (this.options.scope) return this.options.scope(pipeline, partition, view, match);
    // No stamp: the materializer writes the rows, so the guard refuses a $merge of the pipeline
    return scopePipeline(pipeline, { match, collections: view.collections });
  }

  /** The change streams that are open: the views stream and the source streams of the active views. */
  openStreamCount(): number {
    let count = this.viewsStream ? 1 : 0;
    for (const view of this.running.values()) count += view.streams.length;
    return count;
  }

  /** The passes, rebalances and status writes in flight. */
  inFlight(): number {
    return this.pending.size;
  }

  /** The status of the views that the materializer knows, by key `<partition>::<view id>`. */
  views(): Map<string, { state: "active" | "cyclic"; sources: string[]; target: string }> {
    return new Map([...this.running].map(([key, view]) => [key, { state: view.state, sources: view.view.collections, target: view.view.targetCollection }]));
  }

  /** This method starts the materializer: it reads each view, runs it, and watches the views and their sources. */
  async start(): Promise<void> {
    this.stopped = false;
    this.intake = true;
    this.db = await this.options.db();
    // The stream of the views opens before the read of the views: a change between the two reaches both (roadmap O63)
    await this.watchViews();
    const count = await this.resync();
    this.log("info", `started: ${count} view(s)`);
  }

  /** This method stops the passes of new changes: a change starts no pass, and a waiting pass does not start. */
  stopIntake(): void {
    this.intake = false;
    for (const cancel of this.timers.values()) cancel();
    this.timers.clear();
    this.dirty.clear();
  }

  /**
   * This method waits until no work is in flight, until the `deadline` (milliseconds on the clock
   * of the materializer), or until the signal aborts.
   */
  async drain(deadline: number, signal?: AbortSignal): Promise<void> {
    while (this.pending.size > 0 && !signal?.aborted && this.clock.now() < deadline) {
      let cancel: Cancel | undefined;
      const tick = new Promise<void>((resolve) => {
        cancel = this.clock.after(Math.max(0, Math.min(50, deadline - this.clock.now())), resolve);
        cancel.unref?.();
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      await Promise.race([Promise.allSettled([...this.pending]), tick]);
      cancel?.();
    }
  }

  /** This method closes the streams and cancels each timer. The work in flight ends on its own. */
  async close(): Promise<void> {
    this.stopIntake();
    this.stopped = true;
    for (const cancel of this.retries) cancel();
    this.retries.clear();
    for (const key of [...this.running.keys()]) this.tearDown(key);
    const stream = this.viewsStream;
    this.viewsStream = undefined;
    await stream?.close().catch(() => undefined);
  }

  /** This method stops the materializer: `stopIntake()`, `drain()` with no deadline, and `close()`. */
  async stop(): Promise<void> {
    this.stopIntake();
    await this.drain(Number.POSITIVE_INFINITY);
    await this.close();
    await Promise.allSettled([...this.pending]);
  }

  /** This method keeps a promise of work until it ends, so `stop()` can wait for it. */
  private track<R>(work: Promise<R>): Promise<R> {
    this.pending.add(work);
    void work.then(
      () => this.pending.delete(work),
      () => this.pending.delete(work)
    );
    return work;
  }

  /** This method runs work of a partition after the work of that partition before it. */
  private serial(partition: string, work: () => Promise<void>): Promise<void> {
    const before = this.chains.get(partition) ?? Promise.resolve();
    const run = before.then(work, work);
    const settled = run.then(
      () => undefined,
      () => undefined
    );
    this.chains.set(partition, settled);
    void settled.then(() => {
      if (this.chains.get(partition) === settled) this.chains.delete(partition);
    });
    return this.track(run);
  }

  private keyOf(partition: string, id: string): string {
    return `${partition}::${id}`;
  }

  private partitionOf(view: MaterializedView): string | undefined {
    const partition = view[this.partitionField];
    return typeof partition === "string" && partition !== "" ? partition : undefined;
  }

  /**
   * This method runs a change of the set of views after the changes before it. A change of a view
   * document that comes during a resync thus applies after the read of the resync, not before it.
   */
  private inViewOrder<R>(work: () => R | Promise<R>): Promise<R> {
    const run = this.viewChain.then(work);
    this.viewChain = run.catch(() => undefined);
    return run;
  }

  /**
   * This method closes each view, and opens each view of the views collection again: a full
   * catch-up. Open the stream of the views first: then a change after the read reaches the stream.
   */
  private async resync(): Promise<number> {
    const { count, registered } = await this.inViewOrder(async () => {
      const docs = (await this.db!.collection<MaterializedView>(this.viewsName).find({}).toArray()) as MaterializedView[];
      for (const key of [...this.running.keys()]) this.tearDown(key);
      return { count: docs.length, registered: docs.filter((view) => this.register(view)) };
    });
    for (const view of registered) await this.activate(view);
    return count;
  }

  /** This method opens the stream of the views. The promise resolves when the stream is open on the server. */
  private watchViews(): Promise<void> {
    if (this.stopped || !this.db) return Promise.resolve();
    let stream: ChangeStream;
    try {
      stream = this.db.collection(this.viewsName).watch([], { fullDocument: "updateLookup" });
    } catch (error) {
      this.log("error", `cannot watch ${this.viewsName}: ${String((error as Error)?.message ?? error)}`);
      this.later(() => void this.watchViews());
      return Promise.resolve();
    }
    const previous = this.viewsStream;
    if (previous && previous !== stream) previous.close().catch(() => undefined);
    this.viewsStream = stream;

    let again = false;
    const rewatch = (reason: string): void => {
      if (again || this.stopped || this.viewsStream !== stream) return;
      again = true;
      this.log("warn", `the stream of ${this.viewsName} ${reason}: it opens again in ${this.rewatchMs} ms`);
      stream.close().catch(() => undefined);
      this.later(() => {
        // The changes while the stream was closed are lost: a resync catches up, after the new stream is open
        void this.track(this.watchViews().then(() => this.resync())).catch((error: unknown) => this.log("error", `the resync failed: ${String((error as Error)?.message ?? error)}`));
      });
    };

    stream.on("change", (change: Document) => {
      if (this.viewsStream !== stream) return;
      if (change["operationType"] === "invalidate") return rewatch("ended (invalidate)");
      if (change["operationType"] === "update") {
        const description = (change["updateDescription"] ?? {}) as { updatedFields?: Document; removedFields?: string[] };
        const touched = [...Object.keys(description.updatedFields ?? {}), ...(description.removedFields ?? [])];
        // A write of the status only is ours: it does not open the view again
        if (touched.length > 0 && touched.every((path) => path === this.statusField || path.startsWith(`${this.statusField}.`))) return;
      }
      void this.track(this.onViewChange(change)).catch((error: unknown) => this.log("error", `a change of a view failed: ${String((error as Error)?.message ?? error)}`));
    });
    stream.on("error", (error: Error) => rewatch(`failed: ${error.message}`));
    stream.on("close", () => rewatch("closed"));
    return openOnServer(stream);
  }

  private async onViewChange(change: Document): Promise<void> {
    const type = change["operationType"];
    if (type === "insert" || type === "replace" || type === "update") {
      const view = change["fullDocument"] as MaterializedView | null;
      if (!view) return;
      const registered = await this.inViewOrder(() => {
        const partition = this.partitionOf(view);
        if (partition !== undefined) this.tearDown(this.keyOf(partition, view._id));
        return this.register(view);
      });
      if (registered) await this.activate(view);
    } else if (type === "delete") {
      const id = String((change["documentKey"] as Document)["_id"]);
      const partitions = await this.inViewOrder(() => {
        const found = new Set<string>();
        for (const [key, view] of [...this.running]) {
          if (view.view._id === id) {
            found.add(view.partition);
            this.tearDown(key);
          }
        }
        return found;
      });
      // A removed view can break a cycle of the other views
      for (const partition of partitions) await this.rebalance(partition);
    }
  }

  /** This method adds a view to the views that the materializer knows. It gives false for a view that cannot run. */
  private register(view: MaterializedView): boolean {
    const partition = this.partitionOf(view);
    if (partition === undefined) {
      this.log("warn", `the view ${String(view._id)} has no ${this.partitionField}: it does not run`);
      return false;
    }
    if (!Array.isArray(view.collections) || view.collections.length === 0 || typeof view.targetCollection !== "string" || !Array.isArray(view.pipeline)) {
      this.log("warn", `the view ${view._id} needs collections, a pipeline and a targetCollection: it does not run`);
      return false;
    }
    this.running.set(this.keyOf(partition, view._id), { view, partition, state: "active", streams: [] });
    return true;
  }

  /** This method makes the index of the target of a registered view, and rebalances its partition: a new view runs. */
  private async activate(view: MaterializedView): Promise<void> {
    const partition = this.partitionOf(view)!;
    // The readers, the counts and the sweeps read the rows of a partition in a generation
    await this.db!
      .collection(view.targetCollection)
      .createIndex({ [this.partitionField]: 1, [VIEW_GENERATION_FIELD]: 1 })
      .catch((error: unknown) => this.log("error", `the index of ${view.targetCollection} failed: ${String((error as Error)?.message ?? error)}`));
    // A target in a stored form also has the indexes of the storage: the change reads, the order and the tombstones
    let storageTarget: StorageTargetEntry | undefined;
    try {
      storageTarget = this.storageTargetFor(view.targetCollection);
    } catch (error) {
      // The run of the view gives the error to its status
      this.log("error", `the storage target ${view.targetCollection}: ${String((error as Error)?.message ?? error)}`);
    }
    if (storageTarget) {
      await storageWriteTarget(storageTarget.storage)
        .ready()
        .catch((error: unknown) => this.log("error", `the indexes of the storage ${view.targetCollection} failed: ${String((error as Error)?.message ?? error)}`));
    }
    await this.rebalance(partition);
  }

  private tearDown(key: string): void {
    const view = this.running.get(key);
    if (!view) return;
    for (const stream of view.streams) stream.close().catch(() => undefined);
    this.running.delete(key);
    this.storageClaims.delete(key);
  }

  /**
   * The filter of the change stream of a source for a partition. It only removes the events that
   * cannot change a view of the partition: an event whose partition is unknown passes, and the
   * pass of the partition reads its own documents only.
   *
   * - An insert, a replace or an update has the document after the change (`fullDocument`).
   * - With a pre-image (a collection with `changeStreamPreAndPostImages`), each change also has the
   *   document before it: a delete, and an update that moves a document out of the partition.
   * - Without a pre-image, a delete, a replace and an update of the partition field (a top-level
   *   field) can leave any partition: they pass. In a source of `storageSources`, the handler then
   *   reads the partition from the id (`isOtherPartition`).
   * - The handler checks the fields of an update against `sourceFields` (`touchesFields`).
   */
  private sourceMatch(partition: string): Document {
    const field = this.partitionField;
    const noPreImage = { fullDocumentBeforeChange: null };
    return {
      $match: {
        $or: [
          { [`fullDocument.${field}`]: partition },
          { [`fullDocumentBeforeChange.${field}`]: partition },
          { operationType: { $in: ["delete", "replace"] }, ...noPreImage },
          { operationType: "update", ...noPreImage, $or: [{ [`updateDescription.updatedFields.${field}`]: { $exists: true } }, { "updateDescription.removedFields": field }] },
        ],
      },
    };
  }

  /**
   * True for an update that changes no field of `fields` and not the partition field. The keys of
   * an update are paths with dots (`tags.3` after a `$push`, `a.b` after a `$set` of `a.b`), so a key
   * counts when it is a field, a field under it, or a field above it. The removed fields and the
   * truncated arrays count too. The positions in an array do not count (`lines.0.price` is
   * `lines.price`, and `lines.3` is `lines`): that only widens the match.
   */
  private touchesNoField(change: Document, fields: readonly string[] | undefined): boolean {
    if (change["operationType"] !== "update" || !fields || fields.length === 0) return false;
    const description = (change["updateDescription"] ?? {}) as { updatedFields?: Document; removedFields?: string[]; truncatedArrays?: Array<{ field: string }> };
    const keys = [...Object.keys(description.updatedFields ?? {}), ...(description.removedFields ?? []), ...(description.truncatedArrays ?? []).map((truncated) => truncated.field)];
    const watched = [...fields, this.partitionField].map(withoutPositions);
    return !keys.map(withoutPositions).some((key) => watched.some((name) => key === name || key.startsWith(`${name}.`) || name.startsWith(`${key}.`)));
  }

  /**
   * True for a change without a pre-image (a delete, a replace, an update), in a source of
   * `storageSources`, whose document names a storage partition that maps to another partition of
   * the views. The document is `fullDocument`, else `fullDocumentBeforeChange`, else `documentKey`,
   * and `partitionOf` of the form reads its storage partition. A document that is in the partition
   * after the change, a document that does not tell its partition, a key (`documentKey`) that tells
   * another storage partition than the document after the change (a move), a mapping that gives
   * `undefined` and a function that fails do not tell another partition: false.
   */
  private isOtherPartition(change: Document, source: string, partition: string): boolean {
    const storageSource = this.storageSources.get(source);
    if (!storageSource || change["fullDocumentBeforeChange"]) return false;
    if (!["delete", "replace", "update"].includes(change["operationType"] as string)) return false;
    const after = change["fullDocument"] as Document | null | undefined;
    if (after?.[this.partitionField] === partition) return false;
    const key = change["documentKey"] as Document | null | undefined;
    const doc = (after ?? (change["fullDocumentBeforeChange"] as Document | null | undefined) ?? key) as Document | null | undefined;
    if (!doc) return false;
    let viewPartition: string | undefined;
    try {
      const storagePartition = storageSource.form.partitionOf(doc);
      if (typeof storagePartition !== "string") return false;
      // A document whose key tells another partition than the document after the change can have moved out of this partition
      if (after && key) {
        const before = storageSource.form.partitionOf(key);
        if (before !== undefined && before !== storagePartition) return false;
      }
      viewPartition = storageSource.viewPartitionOf(storagePartition);
    } catch {
      return false;
    }
    return typeof viewPartition === "string" && viewPartition !== partition;
  }

  private isCurrent(running: RunningView): boolean {
    return this.running.get(this.keyOf(running.partition, running.view._id)) === running;
  }

  /** This method opens the stream of a source for a view. The promise resolves when the stream is open on the server. */
  private watchSource(running: RunningView, source: string): Promise<void> {
    if (this.stopped || !this.db) return Promise.resolve();
    let stream: ChangeStream;
    try {
      stream = this.db
        .collection(source)
        .watch([this.sourceMatch(running.partition)], { fullDocument: "updateLookup", fullDocumentBeforeChange: "whenAvailable" });
    } catch (error) {
      this.log("error", `cannot watch ${source} for the view ${running.view._id}: ${String((error as Error)?.message ?? error)}`);
      this.later(() => {
        if (this.isCurrent(running) && running.state === "active") void this.watchSource(running, source);
      });
      return Promise.resolve();
    }
    running.streams.push(stream);
    let again = false;
    const rewatch = (reason: string): void => {
      if (again) return;
      again = true;
      stream.close().catch(() => undefined);
      const index = running.streams.indexOf(stream);
      // A close of a teardown also ends the stream: open again only a stream of a current active view
      if (index === -1 || !this.isCurrent(running) || running.state !== "active") return;
      running.streams.splice(index, 1);
      this.log("warn", `the stream of ${source} for the view ${running.view._id} ${reason}: it opens again in ${this.rewatchMs} ms`);
      this.later(() => {
        if (!this.isCurrent(running) || running.state !== "active") return;
        // The changes while the stream was closed are lost: a pass catches up, after the new stream is open
        void this.watchSource(running, source).then(() => this.schedule(running.partition, source));
      });
    };
    stream.on("change", (change: Document) => {
      if (change["operationType"] === "invalidate") return rewatch("ended (invalidate)");
      if (this.isOtherPartition(change, source, running.partition)) return;
      if (this.touchesNoField(change, running.view.sourceFields?.[source])) return;
      this.schedule(running.partition, source);
    });
    stream.on("error", (error: Error) => rewatch(`failed: ${error.message}`));
    stream.on("close", () => rewatch("closed"));
    return openOnServer(stream);
  }

  /** This method runs a function after `rewatch`, unless the materializer stops. The timer does not keep the process alive. */
  private later(work: () => void): void {
    const cancel = this.clock.after(this.rewatchMs, () => {
      this.retries.delete(cancel);
      if (!this.stopped) work();
    });
    cancel.unref?.();
    this.retries.add(cancel);
  }

  /** This method marks a collection as changed, and starts the pass of the partition after the burst. */
  private schedule(partition: string, collection: string): void {
    if (this.stopped || !this.intake) return;
    let dirty = this.dirty.get(partition);
    if (!dirty) this.dirty.set(partition, (dirty = new Set()));
    dirty.add(collection);
    this.timers.get(partition)?.();
    const cancel = this.clock.after(this.debounceMs, () => {
      this.timers.delete(partition);
      if (!this.intake) return;
      void this.serial(partition, () => this.pass(partition)).catch((error: unknown) =>
        this.log("error", `the pass of ${partition} failed: ${String((error as Error)?.message ?? error)}`)
      );
    });
    cancel.unref?.();
    this.timers.set(partition, cancel);
  }

  /** The views of a partition, in the order of their dependencies, and the views in a cycle. */
  private order(partition: string): { sorted: MaterializedView[]; cyclic: Set<string> } {
    const views = [...this.running.values()].filter((running) => running.partition === partition).map((running) => running.view);
    const downstream = new Map<string, Set<string>>(views.map((view) => [view._id, new Set()]));
    const inDegree = new Map<string, number>(views.map((view) => [view._id, 0]));
    for (const a of views) {
      for (const b of views) {
        if (a._id !== b._id && b.collections.includes(a.targetCollection) && !downstream.get(a._id)!.has(b._id)) {
          downstream.get(a._id)!.add(b._id);
          inDegree.set(b._id, inDegree.get(b._id)! + 1);
        }
      }
    }
    const byId = new Map(views.map((view) => [view._id, view]));
    const queue = [...inDegree].filter(([, degree]) => degree === 0).map(([id]) => id);
    const sorted: MaterializedView[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      sorted.push(byId.get(id)!);
      for (const next of downstream.get(id)!) {
        inDegree.set(next, inDegree.get(next)! - 1);
        if (inDegree.get(next) === 0) queue.push(next);
      }
    }
    const done = new Set(sorted.map((view) => view._id));
    return { sorted, cyclic: new Set(views.filter((view) => !done.has(view._id)).map((view) => view._id)) };
  }

  /** This method moves the views of a partition between active and cyclic, and runs each view that becomes active. */
  private rebalance(partition: string): Promise<void> {
    return this.serial(partition, async () => {
      const { sorted, cyclic } = this.order(partition);
      for (const view of [...sorted, ...[...cyclic].map((id) => this.running.get(this.keyOf(partition, id))!.view)]) {
        const running = this.running.get(this.keyOf(partition, view._id));
        if (!running) continue;
        if (cyclic.has(view._id)) {
          if (running.state === "active") {
            for (const stream of running.streams) stream.close().catch(() => undefined);
            running.streams = [];
            running.state = "cyclic";
            await this.writeStatus(view, partition, { state: "cycle", at: Date.now() });
          }
        } else if (running.state === "cyclic" || running.streams.length === 0) {
          running.state = "active";
          // The streams open before the run reads the sources: a change between the two reaches both (roadmap O63)
          await Promise.all(view.collections.map((source) => this.watchSource(running, source)));
          // A change of the view document during the wait replaced this view: the rebalance of the new one runs it
          if (!this.isCurrent(running)) continue;
          await this.runAndWriteStatus(view, partition);
        }
      }
    });
  }

  /** A pass of a partition: each active view whose sources changed, in the order of the dependencies. */
  private async pass(partition: string): Promise<void> {
    const dirty = this.dirty.get(partition);
    if (!dirty || dirty.size === 0) return;
    // The pass takes the set: a change during the pass goes into a new set and a new pass
    this.dirty.delete(partition);
    for (const view of this.order(partition).sorted) {
      const running = this.running.get(this.keyOf(partition, view._id));
      if (!running || running.state !== "active" || !view.collections.some((collection) => dirty.has(collection))) continue;
      const { changed } = await this.runAndWriteStatus(view, partition);
      // A view whose result changed makes its target dirty: the views after it run in this pass
      if (changed) dirty.add(view.targetCollection);
    }
  }

  /** This method runs a view, and writes its status. A failed view does not make its target dirty. */
  private async runAndWriteStatus(view: MaterializedView, partition: string): Promise<{ changed: boolean }> {
    try {
      const changed = await this.run(view, partition);
      await this.writeStatus(view, partition, { state: "ok", at: Date.now() });
      return { changed };
    } catch (error) {
      if (error instanceof PassSuperseded) {
        // Not an error of the view: another process builds it now. A pass comes back after `rewatch`
        this.log("info", `${view._id}: ${error.message}: the view runs again later`);
        this.later(() => this.schedule(partition, view.collections[0]!));
        return { changed: false };
      }
      const message = String((error as Error)?.message ?? error);
      this.log("error", `${view._id}: ${message}`);
      await this.writeStatus(view, partition, { state: "errored", lastError: message, at: Date.now() });
      return { changed: false };
    }
  }

  /**
   * One run of a view. It gives true when the rows of the view changed: then the views that read
   * its target run after it, in the same pass.
   */
  private async run(view: MaterializedView, partition: string): Promise<boolean> {
    const target = this.db!.collection(view.targetCollection);
    const storage = this.targetPartition(view, partition);
    const { status, now } = await this.statusOf(view, partition);
    if (status?.lease && status.lease.until instanceof Date && now < status.lease.until) throw new PassSuperseded("a pass of another process holds the view");
    // The rows of a target in a stored form have no generation: a removal is a tombstone, never a delete of an old generation
    if (!storage) await this.dropOldGenerations(target, partition, status, now);
    const current = status?.generation;
    const generations = await this.currentGenerations(partition);
    // The floor document of the partition of the storage, before the first write (roadmap O66)
    if (storage) await storage.writer.noteFloor(this.db!);
    const size = storage
      ? await target.countDocuments({ ...storage.filter, [TOMBSTONE_FIELD]: { $ne: true } })
      : current
        ? await target.countDocuments({ [this.partitionField]: partition, [VIEW_GENERATION_FIELD]: current })
        : 0;
    if (size <= this.maxTransactionRows) {
      for (let attempt = 1; ; attempt++) {
        try {
          return storage
            ? await this.runStorageInTransaction(view, partition, target, storage, current, generations)
            : await this.runInTransaction(view, partition, target, current, generations);
        } catch (error) {
          if (error instanceof ViewRunError || error instanceof PassSuperseded) throw error;
          if (isWriteConflict(error)) {
            // A write conflict tries again a few times after a short wait, so a steady stream of writes does not starve the view
            if (attempt < CONFLICT_RETRIES) {
              await this.pause(25 * 2 ** attempt * (1 + Math.random()));
              continue;
            }
            throw new PassSuperseded(`another process wrote the view at the same time (${String((error as Error)?.message ?? error)})`);
          }
          this.log("warn", `${view._id}: the transaction failed (${String((error as Error)?.message ?? error)}): the pass writes ${storage ? "in groups" : "a new generation in groups"}`);
          break;
        }
      }
    }
    if (storage) return this.runStorageInGroups(view, partition, target, storage, current, generations);
    await this.runInGroups(view, partition, target, current, generations);
    return true;
  }

  /** This method waits on the clock of the materializer. The timer does not keep the process alive. */
  private pause(delay: number): Promise<void> {
    return new Promise((resolve) => {
      const cancel = this.clock.after(Math.round(delay), resolve);
      cancel.unref?.();
    });
  }

  /**
   * The storage of the partition of a view in its target, or undefined for a target that is not in
   * `storageTargets`. A partition that the storage refuses, and a partition field of the form with
   * another value than the partition of the view, are an error of the view.
   */
  private targetPartition(view: MaterializedView, partition: string): TargetPartition | undefined {
    let entry: StorageTargetEntry | undefined;
    try {
      entry = this.storageTargetFor(view.targetCollection);
    } catch (error) {
      throw new ViewRunError(`the storage target ${view.targetCollection}: ${String((error as Error)?.message ?? error)}`);
    }
    if (!entry) return undefined;
    let writer: StorageWriteTarget;
    let storagePartition: string | undefined;
    try {
      storagePartition = entry.storagePartitionOf(partition);
      writer = storageWriteTarget(storagePartition === undefined ? entry.storage : entry.storage.forPartition(storagePartition));
    } catch (error) {
      throw new ViewRunError(`the partition of the storage ${view.targetCollection}: ${String((error as Error)?.message ?? error)}`);
    }
    // One view writes a partition of a storage target: its run makes a tombstone of each other document of it
    const claim = JSON.stringify([view.targetCollection, storagePartition ?? null]);
    const key = this.keyOf(partition, view._id);
    for (const [other, held] of this.storageClaims) {
      if (other !== key && held.claim === claim && this.running.has(other)) {
        const place = storagePartition === undefined ? "the storage" : `the partition ${storagePartition} of the storage`;
        throw new ViewRunError(`the view ${held.view} (partition ${held.partition}) writes ${place} ${view.targetCollection} already: one view writes a partition of a storage target`);
      }
    }
    this.storageClaims.set(key, { claim, view: view._id, partition });
    const field = this.partitionField;
    if (writer.partitionFields.has(field) && !isDeepStrictEqual(writer.partitionFields.get(field), partition)) {
      throw new ViewRunError(`the stored form of ${view.targetCollection} gives the field ${field} another value than the partition ${partition}`);
    }
    return {
      writer,
      filter: { ...writer.partitionFilter(), [field]: partition },
      partitionInContent: !writer.partitionFields.has(field) && !DOCUMENT_STORAGE_FIELDS.includes(field),
    };
  }

  /**
   * The status of a view in the database (the current generation, and the previous one), and the
   * time of the server: the times of the generations are times of the server.
   */
  private async statusOf(view: MaterializedView, partition: string): Promise<{ status: Partial<MaterializedViewStatus> | undefined; now: Date }> {
    const [doc] = await this.db!
      .collection(this.viewsName)
      .aggregate([{ $match: { _id: view._id, [this.partitionField]: partition } }, { $project: { status: `$${this.statusField}`, now: "$$NOW" } }])
      .toArray();
    if (doc) return { status: doc["status"] as Partial<MaterializedViewStatus> | undefined, now: doc["now"] as Date };
    // The view document went away: no generation to keep or to remove
    return { status: undefined, now: new Date() };
  }

  /** The current generations of the views of a partition: the rows of a target that a pipeline can read. */
  private async currentGenerations(partition: string): Promise<ObjectId[]> {
    const docs = await this.db!.collection(this.viewsName).find({ [this.partitionField]: partition }, { projection: { [`${this.statusField}.generation`]: 1 } }).toArray();
    return docs.map((doc) => (doc[this.statusField] as Partial<MaterializedViewStatus> | undefined)?.generation).filter((generation): generation is ObjectId => generation instanceof ObjectId);
  }

  /**
   * This method removes the rows of the old generations of a view: not the current one, not the
   * previous one during its grace time, and not the generation of a live lease (a pass in groups,
   * maybe of another process, writes it). The rows of a pass that stopped go when its lease ends.
   */
  private async dropOldGenerations(target: Collection, partition: string, status: Partial<MaterializedViewStatus> | undefined, now: Date): Promise<void> {
    const current = status?.generation;
    if (!current) return;
    const previous = status.previous;
    const inGrace = previous?.flippedAt instanceof Date && now.getTime() < previous.flippedAt.getTime() + this.graceMs;
    const lease = status.lease;
    const leased = lease?.until instanceof Date && now < lease.until ? [lease.generation] : [];
    const keep = [current, ...(inGrace ? [previous.generation] : []), ...leased].filter((generation): generation is ObjectId => generation instanceof ObjectId);
    try {
      await target.deleteMany({ [this.partitionField]: partition, [VIEW_GENERATION_FIELD]: { $exists: true, $nin: keep } });
    } catch (error) {
      throw new Error(`the removal of the old generations: ${String((error as Error)?.message ?? error)}`);
    }
  }

  /** The rows of the result, in groups of 1000. A failure of the pipeline, a row without `_id` and too many rows are a `ViewRunError`. */
  private async *resultGroups(view: MaterializedView, partition: string, generations: readonly ObjectId[], generation: ObjectId, storage?: TargetPartition): AsyncGenerator<StoredRow[]> {
    let pipeline: Document[];
    try {
      pipeline = this.scoped(view.pipeline, partition, view, generations);
    } catch (error) {
      throw new ViewRunError(`the guard: ${String((error as Error)?.message ?? error)}`);
    }
    const cursor = this.db!
      .collection(view.collections[0]!)
      .aggregate([...pipeline, { $limit: this.maxRows + 1 }], { maxTimeMS: this.maxTimeMS, batchSize: WRITE_GROUP });
    let count = 0;
    let group: StoredRow[] = [];
    try {
      for (;;) {
        let row: Document | null;
        try {
          row = await cursor.next();
        } catch (error) {
          throw new ViewRunError(`the pipeline: ${String((error as Error)?.message ?? error)}`);
        }
        if (row === null) break;
        if (++count > this.maxRows) throw new ViewRunError(`the result has more than ${this.maxRows} rows`);
        if (storage) {
          group.push(this.storageRowOf(row, partition, storage));
          if (group.length === WRITE_GROUP) {
            yield group;
            group = [];
          }
          continue;
        }
        // The fields of the materializer, for a row that comes from a target: not in the content
        const { _id, [this.partitionField]: _partition, [VIEW_GENERATION_FIELD]: _generation, [VIEW_HASH_FIELD]: _hash, ...content } = row;
        if (_id === undefined || _id === null) throw new ViewRunError("each row of the result needs an _id");
        // The sequence number and the tombstone flag of a MongoDocumentStorage, for a row that passes a
        // source document through: a row is no write of a storage, so a watcher of the target must not
        // read them (roadmap CLI-77). The other fields, for example _json and _key, are the content of the row.
        for (const name of ROW_DROPPED_FIELDS) delete content[name];
        const stored = this.targetId(_id, partition, generation);
        const hash = createHash("sha1").update(canonical(content)).digest("hex");
        group.push({
          id: _id,
          key: idKey(stored),
          hash,
          doc: { _id: stored, ...content, [this.partitionField]: partition, [VIEW_GENERATION_FIELD]: generation, [VIEW_HASH_FIELD]: hash },
        });
        if (group.length === WRITE_GROUP) {
          yield group;
          group = [];
        }
      }
      if (group.length > 0) yield group;
    } finally {
      await cursor.close().catch(() => undefined);
    }
  }

  /**
   * A row of the result as a document of a target in a stored form (roadmap CLI-81). The content is
   * the row without the fields of the materializer and of a storage: a pass-through row of a source
   * in a stored form loses its `_key`, `_kid`, `_kpf`, `_ord` and `_json`, and the encoding of the
   * storage makes them again from the row (`_json` from the content of the row). A field of the row
   * with the name of a partition field of the form takes the value of the partition of the target.
   * The numbers (`_seq`, `_ord`) come at the write.
   */
  private storageRowOf(row: Document, partition: string, storage: TargetPartition): StoredRow {
    const { _id: rowId, [VIEW_GENERATION_FIELD]: _generation, [VIEW_HASH_FIELD]: _hash, ...content } = row;
    let _id: string;
    try {
      _id = this.storageRowIdOf(rowId);
    } catch (error) {
      throw new ViewRunError(`the id of a row of a target in a stored form: ${String((error as Error)?.message ?? error)}`);
    }
    if (typeof _id !== "string") throw new ViewRunError(`storageRowIdOf must give a text, not ${typeof _id}`);
    const field = this.partitionField;
    delete content[field];
    for (const name of DOCUMENT_STORAGE_FIELDS) delete content[name];
    for (const [name, value] of storage.writer.partitionFields) {
      if (!(name in content)) continue;
      if (value === undefined) delete content[name];
      else content[name] = value;
    }
    if (storage.partitionInContent) content[field] = partition;
    let doc: Document;
    try {
      doc = storage.writer.encode(_id, { _id, ...content }, 0, 0);
    } catch (error) {
      throw new ViewRunError(`the row ${JSON.stringify(_id)}: ${String((error as Error)?.message ?? error)}`);
    }
    // A view that reads the target finds the row by the partition field, also in an item stored as JSON text
    if (doc[field] === undefined) doc[field] = partition;
    return { id: _id, key: idKey(doc["_id"]), hash: contentHash(doc), doc };
  }

  private replaceOf(row: StoredRow, partition: string): Document {
    return { replaceOne: { filter: { _id: row.doc["_id"], [this.partitionField]: partition }, replacement: row.doc, upsert: true } };
  }

  /**
   * A run in one transaction, in the current generation (a new one at the first run): the rows that
   * changed, and the removal of the rows that the result does not have. At the first run, the
   * removal also takes the rows of no generation (an older materializer).
   *
   * The rule of convergence: a pass in groups of another process can start after this transaction
   * reads its generation, and flip after it commits. Then the flip overtakes this commit, and the
   * new generation can miss a change that only this pass saw. The change also made the partition
   * dirty in the other process, so its next pass computes the view again, and the view converges.
   */
  private async runInTransaction(view: MaterializedView, partition: string, target: Collection, current: ObjectId | undefined, generations: readonly ObjectId[]): Promise<boolean> {
    const generation = current ?? new ObjectId();
    const session = this.db!.client.startSession();
    let changed = current === undefined;
    const hint = { changed: [] as unknown[], deleted: [] as unknown[] };
    try {
      session.startTransaction();
      // In the transaction: a change of generation by another process since the start supersedes this pass
      const fresh = await this.db!.collection(this.viewsName).findOne({ _id: view._id, [this.partitionField]: partition } as Document, { projection: { [this.statusField]: 1 }, session });
      const now = (fresh?.[this.statusField] as Partial<MaterializedViewStatus> | undefined)?.generation;
      if (!(now === undefined ? current === undefined : current !== undefined && now.equals(current))) throw new PassSuperseded("another process changed the generation of the view");
      const seen = new Set<string>();
      for await (const group of this.resultGroups(view, partition, generations, generation)) {
        const stored = await target
          .find({ _id: { $in: group.map((row) => row.doc["_id"]) }, [this.partitionField]: partition } as Document, { projection: { [VIEW_HASH_FIELD]: 1 }, session })
          .toArray();
        const hashes = new Map(stored.map((doc) => [idKey(doc["_id"]), doc[VIEW_HASH_FIELD]]));
        const rows = group.filter((row) => hashes.get(row.key) !== row.hash);
        const writes = rows.map((row) => this.replaceOf(row, partition));
        for (const row of group) seen.add(row.key);
        for (const row of rows) hint.changed.push(row.id);
        if (writes.length > 0) {
          await target.bulkWrite(writes as never, { ordered: false, session });
          changed = true;
        }
      }
      // The rows of the generation that the result does not have: a group at most, else the pass goes in groups
      const sweep = { [this.partitionField]: partition, [VIEW_GENERATION_FIELD]: current ? generation : { $in: [generation, null] } };
      const stale: unknown[] = [];
      for await (const doc of target.find(sweep, { projection: { _id: 1 }, session })) {
        if (seen.has(idKey(doc["_id"]))) continue;
        stale.push(doc["_id"]);
        if (stale.length > this.maxTransactionRows) throw new Error(`more than ${this.maxTransactionRows} rows to remove`);
      }
      for (const group of groups(stale)) await target.deleteMany({ [this.partitionField]: partition, _id: { $in: group } } as Document, { session });
      if (stale.length > 0) changed = true;
      for (const storedId of stale) hint.deleted.push(this.rowIdOf(storedId));
      if (!current && !(await this.setGeneration(view, partition, generation, { expected: undefined, session }))) {
        throw new PassSuperseded("another process named the first generation of the view");
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction().catch(() => undefined);
      throw error;
    } finally {
      await session.endSession().catch(() => undefined);
    }
    if (hint.changed.length > 0 || hint.deleted.length > 0) this.publishHint(view, partition, hint);
    return changed;
  }

  /**
   * This method publishes the hint of a run of a target that is not in a stored form: one hint
   * for the run, with the ids of the changed rows and of the removed rows. Without ids (a change
   * of generation), with an id that is not a text, or with more than `MAX_HINT_IDS` ids, it is a
   * reset hint. A failure of the publisher goes to the log: the run does not fail.
   */
  private publishHint(view: MaterializedView, partition: string, ids: { changed: readonly unknown[]; deleted: readonly unknown[] } | undefined): void {
    const publish = this.options.publish;
    if (!publish) return;
    const fail = (error: unknown): void => this.log("error", `the hint of ${view._id} failed: ${String((error as Error)?.message ?? error)}`);
    try {
      const topic = this.options.hintTopic ? this.options.hintTopic(view, partition) : collectionChangeTopic(view._id);
      if (topic === undefined) return;
      const texts = (values: readonly unknown[]): values is readonly string[] => values.every((value) => typeof value === "string");
      const event: CollectionChangeEvent =
        ids && ids.changed.length + ids.deleted.length <= MAX_HINT_IDS && texts(ids.changed) && texts(ids.deleted)
          ? { changed: [...new Set(ids.changed)], deleted: [...new Set(ids.deleted)] }
          : { changed: [], deleted: [], reset: true };
      const result = typeof publish === "function" ? publish(topic, event) : publish.emit(topic, event);
      if (result instanceof Promise) result.catch(fail);
    } catch (error) {
      fail(error);
    }
  }

  /**
   * A run in groups, outside a transaction: a whole new generation, then the change of the status to
   * it. The readers of `viewFilter` move to it at once. The rows of no generation go at once: no
   * reader of a generation reads them.
   */
  private async runInGroups(view: MaterializedView, partition: string, target: Collection, current: ObjectId | undefined, generations: readonly ObjectId[]): Promise<void> {
    const generation = new ObjectId();
    const owner = generation.toHexString();
    if (!(await this.takeLease(view, partition, owner, generation))) throw new PassSuperseded("a pass of another process holds the view");
    try {
      let checked = false;
      for await (const group of this.resultGroups(view, partition, generations, generation)) {
        if (!checked) {
          checked = true;
          const first = group[0]!;
          if (idKey(this.targetId(first.id, partition, new ObjectId())) === first.key) {
            throw new ViewRunError("targetId gives the same _id in each generation: the view is too large for one transaction");
          }
        }
        try {
          await target.bulkWrite(group.map((row) => this.replaceOf(row, partition)) as never, { ordered: false });
        } catch (error) {
          throw new Error(`the write of a group of rows: ${String((error as Error)?.message ?? error)}`);
        }
        if (!(await this.renewLease(view, partition, owner))) throw new PassSuperseded("the pass lost its lease");
      }
      // The flip: still the owner of a live lease, and from the generation of the start
      if (!(await this.setGeneration(view, partition, generation, { expected: current, owner, previous: { generation: current ?? null } }))) {
        throw new PassSuperseded("the pass lost its lease, or a newer generation took the view");
      }
    } catch (error) {
      // Its rows stay for a later pass: the end of the lease lets the cleanup remove them
      await this.releaseLease(view, partition, owner).catch(() => undefined);
      throw error;
    }
    // The readers of the view moved to the new generation at once: a gap, so the subscribers read the view in full
    this.publishHint(view, partition, undefined);
    await target.deleteMany({ [this.partitionField]: partition, [VIEW_GENERATION_FIELD]: { $exists: false } });
    // At the end of the grace time, the previous generation goes. The time of the server decides it, so a timer that ends early removes nothing
    const key = this.keyOf(partition, view._id);
    const cancel = this.clock.after(this.graceMs, () => {
      this.retries.delete(cancel);
      if (this.stopped || !this.isCurrentView(key, view)) return;
      void this.serial(partition, async () => {
        const { status, now } = await this.statusOf(view, partition);
        await this.dropOldGenerations(target, partition, status, now);
      }).catch((error: unknown) => this.log("error", `${view._id}: ${String((error as Error)?.message ?? error)}`));
    });
    cancel.unref?.();
    this.retries.add(cancel);
  }

  /**
   * The rows of a group that a run writes in a target in a stored form: each row whose stored
   * document is absent, is a tombstone, or has other content (the numbers do not count). A row
   * keeps the place (`_ord`) of its live stored document. Two rows with the same `_id` in a result
   * are an error of the view.
   */
  private async storageWrites(target: Collection, storage: TargetPartition, group: readonly StoredRow[], seen: Set<string>, session: ClientSession | undefined): Promise<StorageWrite[]> {
    for (const row of group) {
      if (seen.has(row.key)) throw new ViewRunError(`the result has two rows with the _id ${JSON.stringify(row.id)}`);
      seen.add(row.key);
    }
    const stored = await target
      .find({ _id: { $in: group.map((row) => row.doc["_id"]) }, ...storage.writer.partitionFilter() } as Document, session ? { session } : {})
      .toArray();
    const byKey = new Map(stored.map((doc) => [idKey(doc["_id"]), doc]));
    const writes: StorageWrite[] = [];
    for (const row of group) {
      const doc = byKey.get(row.key);
      const live = doc !== undefined && doc[TOMBSTONE_FIELD] !== true;
      if (live && contentHash(doc) === row.hash) continue;
      writes.push({ row, ord: live && typeof doc["_ord"] === "number" ? doc["_ord"] : undefined });
    }
    return writes;
  }

  /**
   * The live documents of the partition of a view in a target in a stored form that the result
   * does not have. A document whose id the result does not have becomes the tombstone of that id. A
   * document that tells no id, or the id of a row of the result (under another stored `_id`),
   * becomes a tombstone without `_key`: no reader reads a delete of an item from it. More than
   * `limit` documents is an error, so a transaction goes in groups.
   */
  private async *storageRemovals(
    target: Collection,
    storage: TargetPartition,
    seen: ReadonlySet<string>,
    session: ClientSession | undefined,
    limit = Number.POSITIVE_INFINITY
  ): AsyncGenerator<StorageRemoval[]> {
    let group: StorageRemoval[] = [];
    let count = 0;
    const cursor = target.find({ ...storage.filter, [TOMBSTONE_FIELD]: { $ne: true } } as Document, { projection: { _id: 1, _key: 1 }, ...(session ? { session } : {}) });
    try {
      for await (const doc of cursor) {
        if (seen.has(idKey(doc["_id"]))) continue;
        if (++count > limit) throw new Error(`more than ${limit} rows to remove`);
        let id = storage.writer.idOfDoc(doc);
        try {
          if (id !== undefined && seen.has(idKey(storage.writer.storedId(id)))) id = undefined;
        } catch {
          id = undefined;
        }
        group.push({ storedId: doc["_id"], id });
        if (group.length === WRITE_GROUP) {
          yield group;
          group = [];
        }
      }
      if (group.length > 0) yield group;
    } finally {
      await cursor.close().catch(() => undefined);
    }
  }

  /**
   * The writes of a target in a stored form with their numbers from `first`: the tombstones first,
   * then the rows. A new row takes its own number as its place. The filter of a write holds the
   * partition: a row of another partition of the view fails with a duplicate key.
   */
  private storageOperations(storage: TargetPartition, partition: string, writes: readonly StorageWrite[], removals: readonly StorageRemoval[], first: number): AnyBulkWriteOperation<Document>[] {
    const field = this.partitionField;
    const operations: AnyBulkWriteOperation<Document>[] = [];
    let seq = first;
    for (const removal of removals) {
      const number = seq++;
      const tomb: Document = removal.id === undefined ? { _id: removal.storedId, _seq: number, [TOMBSTONE_FIELD]: true } : storage.writer.tombstone(removal.id, number);
      const replacement: Document = { ...tomb, _id: removal.storedId };
      for (const [name, value] of storage.writer.partitionFields) if (value !== undefined) replacement[name] = value;
      replacement[field] = partition;
      operations.push({ replaceOne: { filter: { _id: removal.storedId, ...storage.filter, [TOMBSTONE_FIELD]: { $ne: true } } as Document, replacement } });
    }
    for (const { row, ord } of writes) {
      const number = seq++;
      const filter = { _id: row.doc["_id"], ...storage.writer.partitionFilter(), $or: [{ [field]: partition }, { [TOMBSTONE_FIELD]: true }, { [field]: { $exists: false } }] };
      operations.push({ replaceOne: { filter, replacement: { ...row.doc, _seq: number, _ord: ord ?? number }, upsert: true } });
    }
    return operations;
  }

  /**
   * A run of a target in a stored form in one transaction (roadmap CLI-81): the rows that changed,
   * and a tombstone for each row that the result does not have. The numbers are pending numbers of
   * the storage: the run takes them after its reads, writes with them in the transaction, and ends
   * them after the commit. A late run moves its documents to new numbers. The transaction does not
   * write the counters, so the writes of the storage do not conflict with it.
   */
  private async runStorageInTransaction(
    view: MaterializedView,
    partition: string,
    target: Collection,
    storage: TargetPartition,
    current: ObjectId | undefined,
    generations: readonly ObjectId[]
  ): Promise<boolean> {
    const generation = current ?? new ObjectId();
    const db = this.db!;
    const session = db.client.startSession();
    let count = 0;
    let removed = 0;
    try {
      session.startTransaction();
      const fresh = await db.collection(this.viewsName).findOne({ _id: view._id, [this.partitionField]: partition } as Document, { projection: { [this.statusField]: 1 }, session });
      const now = (fresh?.[this.statusField] as Partial<MaterializedViewStatus> | undefined)?.generation;
      if (!(now === undefined ? current === undefined : current !== undefined && now.equals(current))) throw new PassSuperseded("another process changed the generation of the view");
      const seen = new Set<string>();
      const writes: StorageWrite[] = [];
      for await (const group of this.resultGroups(view, partition, generations, generation, storage)) {
        writes.push(...(await this.storageWrites(target, storage, group, seen, session)));
        if (writes.length > this.maxTransactionRows) throw new Error(`more than ${this.maxTransactionRows} rows to write`);
      }
      const removals: StorageRemoval[] = [];
      for await (const group of this.storageRemovals(target, storage, seen, session, this.maxTransactionRows - writes.length)) removals.push(...group);
      count = writes.length + removals.length;
      removed = removals.length;
      const commit = async (first: number): Promise<void> => {
        for (const operations of groups(this.storageOperations(storage, partition, writes, removals, first))) await target.bulkWrite(operations, { ordered: true, session });
        if (!current && !(await this.setGeneration(view, partition, generation, { expected: undefined, session }))) {
          throw new PassSuperseded("another process named the first generation of the view");
        }
        await session.commitTransaction();
      };
      if (count === 0) await commit(0);
      else await storage.writer.withPendingNumbers(db, count, commit);
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction().catch(() => undefined);
      throw error;
    } finally {
      await session.endSession().catch(() => undefined);
    }
    if (removed > 0) await storage.writer.prune(db);
    return count > 0 || current === undefined;
  }

  /**
   * A run of a target in a stored form in groups, outside a transaction (roadmap CLI-81): the rows
   * of each group that changed, then the tombstones of the rows that the result does not have, with
   * the pending numbers of the storage. The run writes in place, so a reader can see a part of it.
   * It holds the lease of the view, and renews it after each group. The first run names a
   * generation in the status of the view: the mark of a view that ran.
   */
  private async runStorageInGroups(
    view: MaterializedView,
    partition: string,
    target: Collection,
    storage: TargetPartition,
    current: ObjectId | undefined,
    generations: readonly ObjectId[]
  ): Promise<boolean> {
    const generation = current ?? new ObjectId();
    const owner = new ObjectId().toHexString();
    const db = this.db!;
    if (!(await this.takeLease(view, partition, owner, generation))) throw new PassSuperseded("a pass of another process holds the view");
    let changed = current === undefined;
    let removed = false;
    try {
      const seen = new Set<string>();
      for await (const group of this.resultGroups(view, partition, generations, generation, storage)) {
        const writes = await this.storageWrites(target, storage, group, seen, undefined);
        if (writes.length > 0) {
          changed = true;
          await storage.writer.withPendingNumbers(db, writes.length, (first) => target.bulkWrite(this.storageOperations(storage, partition, writes, [], first), { ordered: true }));
        }
        if (!(await this.renewLease(view, partition, owner))) throw new PassSuperseded("the pass lost its lease");
      }
      for await (const removals of this.storageRemovals(target, storage, seen, undefined)) {
        changed = true;
        removed = true;
        await storage.writer.withPendingNumbers(db, removals.length, (first) => target.bulkWrite(this.storageOperations(storage, partition, [], removals, first), { ordered: true }));
        if (!(await this.renewLease(view, partition, owner))) throw new PassSuperseded("the pass lost its lease");
      }
      if (current === undefined) {
        if (!(await this.setGeneration(view, partition, generation, { expected: undefined, owner }))) {
          throw new PassSuperseded("the pass lost its lease, or another process named the first generation of the view");
        }
      } else {
        await this.releaseLease(view, partition, owner);
      }
    } catch (error) {
      await this.releaseLease(view, partition, owner).catch(() => undefined);
      throw error;
    } finally {
      if (removed) await storage.writer.prune(db).catch((error: unknown) => this.log("error", `${view._id}: the prune of the tombstones failed: ${String((error as Error)?.message ?? error)}`));
    }
    return changed;
  }

  /** True while the view is the one that the materializer runs for this key. */
  private isCurrentView(key: string, view: MaterializedView): boolean {
    return this.running.get(key)?.view === view;
  }

  /**
   * This method names the current generation of a view in its status, as a compare-and-set: only
   * from the generation `expected`, and with `owner`, only while that pass holds a live lease. Then
   * it ends the lease, and names the previous generation with the time of the change on the server
   * (`$$NOW`). It gives false when another process changed the view.
   */
  private async setGeneration(
    view: MaterializedView,
    partition: string,
    generation: ObjectId,
    options: { expected: ObjectId | undefined; owner?: string; previous?: { generation: ObjectId | null }; session?: ClientSession }
  ): Promise<boolean> {
    const field = this.statusField;
    const filter: Document = { _id: view._id, [this.partitionField]: partition, [`${field}.generation`]: options.expected ?? { $exists: false } };
    if (options.owner !== undefined) {
      filter[`${field}.lease.owner`] = options.owner;
      filter["$expr"] = { $gt: [`$${field}.lease.until`, "$$NOW"] };
    }
    const set: Document = { [`${field}.generation`]: { $literal: generation } };
    if (options.previous) set[`${field}.previous`] = { generation: { $literal: options.previous.generation }, flippedAt: "$$NOW" };
    const update: Document[] = [{ $set: set }];
    if (options.owner !== undefined) update.push({ $unset: `${field}.lease` });
    const result = await this.db!.collection(this.viewsName).updateOne(filter, update, options.session ? { session: options.session } : {});
    return result.matchedCount === 1;
  }

  /** This method takes the lease of a view for a pass in groups, when no live lease holds it. It gives false when one does. */
  private async takeLease(view: MaterializedView, partition: string, owner: string, generation: ObjectId): Promise<boolean> {
    const field = this.statusField;
    const result = await this.db!.collection(this.viewsName).updateOne(
      { _id: view._id, [this.partitionField]: partition, $expr: { $not: [{ $gt: [`$${field}.lease.until`, "$$NOW"] }] } } as Document,
      [{ $set: { [`${field}.lease`]: { owner: { $literal: owner }, generation: { $literal: generation }, until: { $add: ["$$NOW", this.leaseMs] } } } }]
    );
    return result.matchedCount === 1;
  }

  /** This method renews the lease of a pass, while it is live and still its own. It gives false when the pass lost it. */
  private async renewLease(view: MaterializedView, partition: string, owner: string): Promise<boolean> {
    const field = this.statusField;
    const renewed = await this.db!.collection(this.viewsName).findOneAndUpdate(
      { _id: view._id, [this.partitionField]: partition, [`${field}.lease.owner`]: owner, $expr: { $gt: [`$${field}.lease.until`, "$$NOW"] } } as Document,
      [{ $set: { [`${field}.lease.until`]: { $add: ["$$NOW", this.leaseMs] } } }],
      { projection: { _id: 1 } }
    );
    return renewed !== null;
  }

  /** This method ends the lease of a pass, when it is still its own. */
  private async releaseLease(view: MaterializedView, partition: string, owner: string): Promise<void> {
    await this.db!.collection(this.viewsName).updateOne({ _id: view._id, [this.partitionField]: partition, [`${this.statusField}.lease.owner`]: owner } as Document, { $unset: { [`${this.statusField}.lease`]: "" } });
  }

  /** This method writes the state of a view. It keeps the generations of the status. */
  private async writeStatus(view: MaterializedView, partition: string, status: Pick<MaterializedViewStatus, "state" | "lastError" | "at">): Promise<void> {
    if (this.stopped) return;
    const field = this.statusField;
    const update: Document = { $set: { [`${field}.state`]: status.state, [`${field}.at`]: status.at } };
    if (status.lastError !== undefined) update["$set"][`${field}.lastError`] = status.lastError;
    else update["$unset"] = { [`${field}.lastError`]: "" };
    try {
      await this.db!.collection(this.viewsName).updateOne({ _id: view._id, [this.partitionField]: partition } as Document, update);
    } catch (error) {
      this.log("error", `the status of ${view._id} failed: ${String((error as Error)?.message ?? error)}`);
    }
  }
}
