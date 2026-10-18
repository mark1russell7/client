/**
 * Materialized views driven by change streams (Graph's split plan, part P4). A view is a document
 * of a views collection: an aggregation pipeline over source collections whose result goes into a
 * target collection, for one partition (for example one tenant). The materializer runs each view
 * when its sources change, and keeps the target equal to the result of the pipeline.
 *
 * - The views of a partition run in the order of their dependencies: a view whose target is the
 *   source of another view runs first, in the same pass. A view in a cycle does not run, and its
 *   status is `cycle`.
 * - A pass runs after the last change of a burst (`debounceMs`), and only the views whose sources
 *   changed. A run computes the result first. When the result is the same as at the last run, it
 *   writes nothing. Else it merges the result into the target and removes the rows that the result
 *   does not have.
 * - Each pipeline goes through the guard of the scope (`scopePipeline` by default): it reads only
 *   the documents of its partition, in its sources, and writes only into its target.
 * - A change stream that ends (for example after `dropDatabase`) opens again after `rewatchMs`,
 *   and a pass catches up on the changes that the stream missed.
 * - The status of each view (`ok`, `errored`, `cycle`) goes into the field `statusField` of its
 *   document. The materializer ignores an update of only that field.
 *
 * Change streams need a replica set. The target of a view is a plain collection: a `$merge` into
 * the collection of a `MongoDocumentStorage` would not go through its change log.
 */

import { createHash } from "node:crypto";
import { BSON, type ChangeStream, type Db, type Document } from "mongodb";
import { scopePipeline } from "./pipeline-scope.js";

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
   * The fields that the pipeline reads, for each source. An update of a source that changes none
   * of them does not start a pass. Without it, each update of the source starts a pass.
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
}

/** The function that guards the pipeline of a view for its partition. */
export type ViewPipelineScope = (pipeline: Document[], partition: string, view: MaterializedView) => Document[];

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
   * The guard of a pipeline. The default is `scopePipeline` with the partition as the filter and
   * the stamp, and the sources and the target as the collections.
   */
  scope?: ViewPipelineScope | undefined;
  /** The time after the last change before a pass (default 100 ms). */
  debounceMs?: number | undefined;
  /** The time before a change stream that ended opens again (default 1000 ms). */
  rewatchMs?: number | undefined;
  /** The longest time of a pipeline (default 30000 ms). */
  maxTimeMS?: number | undefined;
  /** The most rows of the result of a view (default 100000). A larger result is an error of the view. */
  maxRows?: number | undefined;
  /** The log (default `console`, with the prefix `[materializer]`). */
  log?: ((level: "info" | "warn" | "error", message: string) => void) | undefined;
}

/** A view that the materializer knows. */
interface RunningView {
  view: MaterializedView;
  partition: string;
  /** `active`: its streams are open, and it runs in the passes. `cyclic`: it is in a cycle, and it waits. */
  state: "active" | "cyclic";
  streams: ChangeStream[];
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
  /** The last result of each view: row key to the hash of the row. */
  private readonly lastResult = new Map<string, Map<string, string>>();
  /** The collections that changed since the last pass, for each partition. */
  private readonly dirty = new Map<string, Set<string>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** The work of each partition, one at a time: the passes and the rebalances. */
  private readonly chains = new Map<string, Promise<void>>();
  private readonly pending = new Set<Promise<unknown>>();
  private stopped = true;

  constructor(options: ViewMaterializerOptions) {
    this.options = options;
    this.viewsName = options.views ?? "_aggregations";
    this.partitionField = options.partitionField ?? "_part";
    this.statusField = options.statusField ?? "_materializerStatus";
    this.debounceMs = options.debounceMs ?? 100;
    this.rewatchMs = options.rewatchMs ?? 1000;
    this.maxTimeMS = options.maxTimeMS ?? 30_000;
    this.maxRows = options.maxRows ?? 100_000;
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    if (this.options.log) this.options.log(level, message);
    else console[level === "info" ? "log" : level](`[materializer] ${message}`);
  }

  /** The guard of a pipeline of a view. */
  private scoped(pipeline: Document[], partition: string, view: MaterializedView): Document[] {
    if (this.options.scope) return this.options.scope(pipeline, partition, view);
    return scopePipeline(pipeline, {
      match: { [this.partitionField]: partition },
      stamp: { [this.partitionField]: partition },
      collections: [...new Set([...view.collections, view.targetCollection])],
    });
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
    this.db = await this.options.db();
    const count = await this.resync();
    this.watchViews();
    this.log("info", `started: ${count} view(s)`);
  }

  /**
   * This method stops the materializer: it closes the streams, cancels the waiting passes, and
   * waits for the work in flight.
   */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.dirty.clear();
    for (const key of [...this.running.keys()]) this.tearDown(key);
    const stream = this.viewsStream;
    this.viewsStream = undefined;
    await stream?.close().catch(() => undefined);
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

  /** This method closes each view, and opens each view of the views collection again: a full catch-up. */
  private async resync(): Promise<number> {
    for (const key of [...this.running.keys()]) this.tearDown(key);
    const docs = (await this.db!.collection<MaterializedView>(this.viewsName).find({}).toArray()) as MaterializedView[];
    for (const view of docs) await this.spinUp(view);
    return docs.length;
  }

  private watchViews(): void {
    if (this.stopped || !this.db) return;
    let stream: ChangeStream;
    try {
      stream = this.db.collection(this.viewsName).watch([], { fullDocument: "updateLookup" });
    } catch (error) {
      this.log("error", `cannot watch ${this.viewsName}: ${String((error as Error)?.message ?? error)}`);
      this.later(() => this.watchViews());
      return;
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
        this.watchViews();
        void this.track(this.resync()).catch((error: unknown) => this.log("error", `the resync failed: ${String((error as Error)?.message ?? error)}`));
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
  }

  private async onViewChange(change: Document): Promise<void> {
    const type = change["operationType"];
    if (type === "insert" || type === "replace" || type === "update") {
      const view = change["fullDocument"] as MaterializedView | null;
      if (!view) return;
      const partition = this.partitionOf(view);
      if (partition !== undefined) this.tearDown(this.keyOf(partition, view._id));
      await this.spinUp(view);
    } else if (type === "delete") {
      const id = String((change["documentKey"] as Document)["_id"]);
      const partitions = new Set<string>();
      for (const [key, view] of [...this.running]) {
        if (view.view._id === id) {
          partitions.add(view.partition);
          this.tearDown(key);
        }
      }
      // A removed view can break a cycle of the other views
      for (const partition of partitions) await this.rebalance(partition);
    }
  }

  private async spinUp(view: MaterializedView): Promise<void> {
    const partition = this.partitionOf(view);
    if (partition === undefined) {
      this.log("warn", `the view ${String(view._id)} has no ${this.partitionField}: it does not run`);
      return;
    }
    if (!Array.isArray(view.collections) || view.collections.length === 0 || typeof view.targetCollection !== "string" || !Array.isArray(view.pipeline)) {
      this.log("warn", `the view ${view._id} needs collections, a pipeline and a targetCollection: it does not run`);
      return;
    }
    this.running.set(this.keyOf(partition, view._id), { view, partition, state: "active", streams: [] });
    // The key of $merge: the id and the partition
    await this.db!
      .collection(view.targetCollection)
      .createIndex({ _id: 1, [this.partitionField]: 1 }, { unique: true, name: `_id_${this.partitionField}_unique` })
      .catch((error: unknown) => this.log("error", `the index of ${view.targetCollection} failed: ${String((error as Error)?.message ?? error)}`));
    await this.rebalance(partition);
  }

  private tearDown(key: string): void {
    const view = this.running.get(key);
    if (!view) return;
    for (const stream of view.streams) stream.close().catch(() => undefined);
    this.running.delete(key);
    this.lastResult.delete(key);
  }

  /** The filter of the change stream of a source for a partition. */
  private sourceMatch(partition: string, fields: string[] | undefined): Document {
    // A delete has no fullDocument: it passes, and the pass of the partition reads its own documents only
    const inPartition = { $or: [{ [`fullDocument.${this.partitionField}`]: partition }, { operationType: "delete" }] };
    if (!fields || fields.length === 0) return { $match: inPartition };
    return {
      $match: {
        $and: [
          inPartition,
          {
            $or: [
              { operationType: { $in: ["insert", "delete", "replace"] } },
              { operationType: "update", $or: fields.map((field) => ({ [`updateDescription.updatedFields.${field}`]: { $exists: true } })) },
            ],
          },
        ],
      },
    };
  }

  private isCurrent(running: RunningView): boolean {
    return this.running.get(this.keyOf(running.partition, running.view._id)) === running;
  }

  private watchSource(running: RunningView, source: string): void {
    if (this.stopped || !this.db) return;
    let stream: ChangeStream;
    try {
      stream = this.db.collection(source).watch([this.sourceMatch(running.partition, running.view.sourceFields?.[source])], { fullDocument: "updateLookup" });
    } catch (error) {
      this.log("error", `cannot watch ${source} for the view ${running.view._id}: ${String((error as Error)?.message ?? error)}`);
      this.later(() => {
        if (this.isCurrent(running) && running.state === "active") this.watchSource(running, source);
      });
      return;
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
        this.watchSource(running, source);
        // The changes while the stream was closed are lost: a pass catches up
        this.schedule(running.partition, source);
      });
    };
    stream.on("change", (change: Document) => {
      if (change["operationType"] === "invalidate") return rewatch("ended (invalidate)");
      this.schedule(running.partition, source);
    });
    stream.on("error", (error: Error) => rewatch(`failed: ${error.message}`));
    stream.on("close", () => rewatch("closed"));
  }

  /** This method runs a function after `rewatchMs`, unless the materializer stops. The timer does not keep the process alive. */
  private later(work: () => void): void {
    const timer = setTimeout(() => {
      if (!this.stopped) work();
    }, this.rewatchMs);
    timer.unref?.();
  }

  /** This method marks a collection as changed, and starts the pass of the partition after the burst. */
  private schedule(partition: string, collection: string): void {
    if (this.stopped) return;
    let dirty = this.dirty.get(partition);
    if (!dirty) this.dirty.set(partition, (dirty = new Set()));
    dirty.add(collection);
    const before = this.timers.get(partition);
    if (before) clearTimeout(before);
    const timer = setTimeout(() => {
      this.timers.delete(partition);
      void this.serial(partition, () => this.pass(partition)).catch((error: unknown) =>
        this.log("error", `the pass of ${partition} failed: ${String((error as Error)?.message ?? error)}`)
      );
    }, this.debounceMs);
    timer.unref?.();
    this.timers.set(partition, timer);
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
          for (const source of view.collections) this.watchSource(running, source);
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
      const message = String((error as Error)?.message ?? error);
      this.log("error", `${view._id}: ${message}`);
      await this.writeStatus(view, partition, { state: "errored", lastError: message, at: Date.now() });
      return { changed: false };
    }
  }

  /**
   * One run of a view: the result first; nothing more when it is the same as the last result; else
   * a `$merge` of the result into the target and a removal of the rows that the result does not
   * have. It gives true when it wrote.
   */
  private async run(view: MaterializedView, partition: string): Promise<boolean> {
    const db = this.db!;
    const key = this.keyOf(partition, view._id);
    const source = view.collections[0]!;
    let rows: Document[];
    try {
      rows = await db
        .collection(source)
        .aggregate([...this.scoped(view.pipeline, partition, view), { $limit: this.maxRows + 1 }], { maxTimeMS: this.maxTimeMS })
        .toArray();
    } catch (error) {
      throw new Error(`the pipeline: ${String((error as Error)?.message ?? error)}`);
    }
    if (rows.length > this.maxRows) throw new Error(`the result has more than ${this.maxRows} rows`);
    const result = new Map<string, string>();
    for (const row of rows) {
      const { _id, [this.partitionField]: _partition, ...content } = row;
      result.set(idKey(_id), createHash("sha1").update(canonical(content)).digest("hex"));
    }
    const last = this.lastResult.get(key);
    if (last && last.size === result.size && [...result].every(([id, hash]) => last.get(id) === hash)) return false;

    const merge = [...view.pipeline, { $merge: { into: view.targetCollection, whenMatched: "replace", whenNotMatched: "insert" } }];
    try {
      await db.collection(source).aggregate(this.scoped(merge, partition, view), { maxTimeMS: this.maxTimeMS }).toArray();
    } catch (error) {
      throw new Error(`the merge: ${String((error as Error)?.message ?? error)}`);
    }
    try {
      // The raw ids of the result: the equality of BSON keeps an ObjectId apart from its text
      await db.collection(view.targetCollection).deleteMany({ [this.partitionField]: partition, _id: { $nin: rows.map((row) => row["_id"]) } });
    } catch (error) {
      throw new Error(`the removal of the old rows: ${String((error as Error)?.message ?? error)}`);
    }
    this.lastResult.set(key, result);
    return true;
  }

  private async writeStatus(view: MaterializedView, partition: string, status: MaterializedViewStatus): Promise<void> {
    if (this.stopped) return;
    try {
      await this.db!.collection(this.viewsName).updateOne({ _id: view._id, [this.partitionField]: partition } as Document, { $set: { [this.statusField]: status } });
    } catch (error) {
      this.log("error", `the status of ${view._id} failed: ${String((error as Error)?.message ?? error)}`);
    }
  }
}
