/**
 * `MongoViewStorage`: the rows of one materialized view as a read-only `CollectionStorage`
 * (roadmap CLI-38). The collection procedures can then serve a view, and each reader of them gets
 * one whole generation.
 *
 * A `ViewMaterializer` writes a big rebuild as a new generation in groups. Then it changes the
 * generation in the status of the view. During the rebuild, the target has the rows of two
 * generations, and a plain query reads both. This storage reads the status of the view one time
 * for each operation, and reads only the rows of that generation (`viewFilter`). Thus `get`,
 * `getAll`, `find`, `changes` and the other reads of the procedures do not mix two generations.
 *
 * - The key of a row is the `_id` of the row in the result of the pipeline. It must be a text.
 * - The value of a row is the row of the result: its `_id` and its fields, without the fields of
 *   the materializer (the partition, `_viewGen` and `_viewHash`).
 * - The storage has no change log. The procedure `changes` thus gives all the rows of the current
 *   generation.
 * - A read that starts before a change of generation ends on the previous generation. The
 *   materializer keeps its rows for `generationGrace`, so a read must end in that time.
 * - Before the first pass of the view, and without the view document, the storage has no row.
 * - Only the materializer writes a target. Each write of this storage rejects with `FORBIDDEN`.
 */

import type { Collection, Db, Document, ObjectId } from "mongodb";
import type { CollectionStorage, StorageMetadata } from "@procedures/collections";
import { ensureConnection } from "../connection.js";
import { defaultRowId, partitionTargetId, viewFilter, VIEW_GENERATION_FIELD, VIEW_HASH_FIELD, type MaterializedView, type MaterializedViewStatus, type ViewTargetId } from "./materializer.js";

/** The options of a `MongoViewStorage`. Give the same names as to the `ViewMaterializer` of the view. */
export interface MongoViewStorageOptions {
  /** The `_id` of the document of the view. The document names the partition and the target. */
  view: string;
  /** The database of the views and of the target. The default is the database of the default connection, for each operation. */
  db?: (() => Db | Promise<Db>) | undefined;
  /** The collection of the view documents (default `_aggregations`). */
  views?: string | undefined;
  /** The field of a document that names its partition (default `_part`). */
  partitionField?: string | undefined;
  /** The field of a view document that keeps its status (default `_materializerStatus`). */
  statusField?: string | undefined;
  /**
   * The stored `_id` of a row from its key, the partition and the generation (default
   * `partitionTargetId`). It is the option `targetId` of the materializer. `get`, `has` and
   * `getBatch` find a row with it.
   */
  targetId?: ViewTargetId | undefined;
  /**
   * The `_id` of the row in the result, from its stored `_id`. It reverses `targetId`. The default
   * reads the field `id` of the form of `partitionTargetId`.
   */
  rowIdOf?: ((storedId: unknown) => unknown) | undefined;
}

/** The current generation of a view: its target, and the filter of its rows. */
interface Generation {
  readonly target: Collection<Document>;
  readonly filter: Document;
  readonly partition: string;
  readonly generation: ObjectId;
}

/**
 * A read-only `CollectionStorage` over the target of one materialized view (roadmap CLI-38). Each
 * read gives the rows of the current generation of the view only.
 *
 * @example
 * ```typescript
 * const server = new ProcedureServer({ collections: { totals: new MongoViewStorage({ view: "totals", db: () => db }) } });
 * server.registerCollectionProcedures("totals");
 * ```
 */
export class MongoViewStorage<T = Document> implements CollectionStorage<T> {
  private readonly options: MongoViewStorageOptions;
  private readonly viewsName: string;
  private readonly partitionField: string;
  private readonly statusField: string;
  private readonly targetId: ViewTargetId;
  private readonly rowIdOf: (storedId: unknown) => unknown;
  private closed = false;

  constructor(options: MongoViewStorageOptions) {
    if (typeof options.view !== "string" || options.view === "") throw new Error("A MongoViewStorage needs the _id of its view");
    this.options = options;
    this.viewsName = options.views ?? "_aggregations";
    this.partitionField = options.partitionField ?? "_part";
    this.statusField = options.statusField ?? "_materializerStatus";
    this.targetId = options.targetId ?? partitionTargetId;
    this.rowIdOf = options.rowIdOf ?? defaultRowId;
  }

  // ===========================================================================
  // The generation of a read
  // ===========================================================================

  /**
   * The current generation of the view: one read of the view document. Each read of the storage
   * uses one generation, so it gives the rows of one generation only. The result is undefined
   * before the first pass of the view, or without the view document.
   */
  private async current(): Promise<Generation | undefined> {
    this.checkOpen();
    const db = this.options.db ? await this.options.db() : (await ensureConnection()).getDb();
    const view = (await db.collection(this.viewsName).findOne({ _id: this.options.view } as Document)) as unknown as MaterializedView | null;
    if (!view || typeof view.targetCollection !== "string") return undefined;
    const partition = view[this.partitionField];
    const generation = (view[this.statusField] as Partial<MaterializedViewStatus> | undefined)?.generation;
    if (typeof partition !== "string" || !generation) return undefined;
    return {
      target: db.collection(view.targetCollection),
      filter: viewFilter(view, { partitionField: this.partitionField, statusField: this.statusField }),
      partition,
      generation,
    };
  }

  /** The stored `_id` of a key in a generation. */
  private storedId(id: string, generation: Generation): unknown {
    return this.targetId(id, generation.partition, generation.generation);
  }

  /** The key and the value of a stored row. A row whose `_id` is not a text cannot have a key. */
  private decode(doc: Document): [string, T] {
    const { _id: storedId, [this.partitionField]: _partition, [VIEW_GENERATION_FIELD]: _generation, [VIEW_HASH_FIELD]: _hash, ...content } = doc;
    const id = this.rowIdOf(storedId);
    if (typeof id !== "string") {
      throw new Error(`A row of the view ${this.options.view} has an _id that is not a text: give each row of its result a text _id`);
    }
    const value: Record<string, unknown> = { _id: id, ...content };
    return [id, value as T];
  }

  /** The rows of the current generation, in the order of their stored `_id`. */
  private async entriesOf(extra?: Document): Promise<Array<[string, T]>> {
    const generation = await this.current();
    return generation ? this.rowsOf(generation, extra) : [];
  }

  /** The rows of one generation that was already read, in the order of their stored `_id`. */
  private async rowsOf(generation: Generation, extra?: Document): Promise<Array<[string, T]>> {
    const docs = await generation.target
      .find({ ...generation.filter, ...extra } as Document)
      .sort({ _id: 1 })
      .toArray();
    return docs.map((doc) => this.decode(doc));
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async get(id: string): Promise<T | undefined> {
    const generation = await this.current();
    if (!generation) return undefined;
    const doc = await generation.target.findOne({ ...generation.filter, _id: this.storedId(id, generation) } as Document);
    return doc ? this.decode(doc)[1] : undefined;
  }

  async getAll(): Promise<T[]> {
    return (await this.entriesOf()).map(([, value]) => value);
  }

  async getEntries(): Promise<Array<[string, T]>> {
    return this.entriesOf();
  }

  async getIds(): Promise<string[]> {
    return (await this.entriesOf()).map(([id]) => id);
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return (await this.getAll()).filter(predicate);
  }

  async has(id: string): Promise<boolean> {
    const generation = await this.current();
    if (!generation) return false;
    return (await generation.target.countDocuments({ ...generation.filter, _id: this.storedId(id, generation) } as Document, { limit: 1 })) > 0;
  }

  async size(): Promise<number> {
    const generation = await this.current();
    if (!generation) return 0;
    return generation.target.countDocuments(generation.filter);
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    const generation = await this.current();
    if (!generation || ids.length === 0) return result;
    // The ids and the filter come from the same generation (before, a second read of the view
    // could give the filter of a newer generation: audit pass 2)
    const byId = new Map(await this.rowsOf(generation, { _id: { $in: ids.map((id) => this.storedId(id, generation)) } }));
    // The order of the ids of the call
    for (const id of ids) if (byId.has(id)) result.set(id, byId.get(id)!);
    return result;
  }

  // ===========================================================================
  // Writes: only the materializer writes a target
  // ===========================================================================

  private readOnly(): Promise<never> {
    this.checkOpen();
    return Promise.reject(
      Object.assign(new Error(`The view ${this.options.view} is read-only: only its materializer writes its target`), { code: "FORBIDDEN", retryable: false }),
    );
  }

  async set(_id: string, _value: T): Promise<void> {
    return this.readOnly();
  }

  async setBatch(_items: Array<[string, T]>): Promise<void> {
    return this.readOnly();
  }

  async delete(_id: string): Promise<boolean> {
    return this.readOnly();
  }

  async deleteBatch(_ids: string[]): Promise<number> {
    return this.readOnly();
  }

  async clear(): Promise<void> {
    return this.readOnly();
  }

  // ===========================================================================
  // The life of the storage
  // ===========================================================================

  /** This method closes the storage. After it, each operation rejects, and a second `close()` does nothing. */
  async close(): Promise<void> {
    this.closed = true;
  }

  private checkOpen(): void {
    if (this.closed) throw new Error(`The MongoViewStorage of the view ${this.options.view} is closed`);
  }

  async getMetadata(): Promise<StorageMetadata> {
    return { type: "custom", size: await this.size(), stats: { view: this.options.view } };
  }
}
