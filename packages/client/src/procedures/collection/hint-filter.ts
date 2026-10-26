/**
 * The row filter of the change events of a collection (roadmap CLI-78).
 *
 * A change event names the ids that changed. Before CLI-78, each subscriber of a topic got all the
 * ids, so only a principal that reads the whole partition could subscribe. With CLI-78, the publisher
 * filters each event row by row for each subscriber, with the rule of the rows of the collection
 * (`admission.admit`). The reads apply the same rule (`admittedStorage()`).
 *
 * - The rule comes from the registry of the call: `createCollectionProcedures()` puts its rules on
 *   the metadata of its procedures. An event can also carry the rules in its images.
 * - The rule examines the rows of the images of the event (`withHintImages()`): the row after the
 *   changes, and the row before them. The publisher does not read a storage.
 * - A changed row that the rule admits stays in `changed`. A changed row that the rule refuses, or
 *   a deleted row, goes to `deleted` only when the rule admitted its row before the changes.
 *   Otherwise the subscriber does not get its id.
 * - When an image is missing, or the rule fails, the subscriber gets a hint without ids and
 *   without `since`. It then reads the changes, through the rule of the reads.
 * - An event without ids, and a `reset` event, pass without ids.
 * - When the subscriber gets no id of an event, it gets no event. The `since` of its next event is
 *   then the `version` of the last event that it got. Thus it applies the next delta without a read.
 * - `admission.admitsAll` tells that a subscriber reads each row of its partition. Its events then
 *   pass as before CLI-78, with no cost.
 */
import type { Invocation } from "../invoke.js";
import type { AnyProcedure, ProcedureContext } from "../types.js";
import type { CollectionAdmission } from "./admission.js";
import { withRows } from "../../events/rows.js";
import type { EventBus } from "../../events/types.js";

/** The state of one row in an image: the stored item, or no item. */
export type HintRowState = { readonly found: true; readonly value: unknown } | { readonly found: false };

/**
 * The rows of a change event, for the row filter of each subscriber (roadmap CLI-78). A missing id
 * in a map is unknown. The images are on a symbol key, so they stay in this process: JSON does
 * not take them.
 */
export interface HintImages {
  /** The rows after the changes of the event, by id. */
  readonly after?: ReadonlyMap<string, HintRowState> | undefined;
  /** The rows before the changes of the event (at its `since`), by id. */
  readonly before?: ReadonlyMap<string, HintRowState> | undefined;
  /**
   * The rules of the rows of the collection. The publisher uses the rules from its registry
   * first, and these rules only when the registry has none.
   */
  readonly admission?: CollectionAdmission | undefined;
}

/** The key of the images of an event. */
const IMAGES: unique symbol = Symbol.for("procedures.hintImages");

/**
 * This function gives the event with its images, for the row filter of each subscriber (roadmap
 * CLI-78). The images are not enumerable: a copy or a comparison of the event does not see them.
 */
export function withHintImages<T extends object>(event: T, images: HintImages): T {
  return Object.defineProperty(event, IMAGES, { value: images, enumerable: false, configurable: true });
}

/** The images of an event, or undefined for an event without images. */
export function hintImagesOf(event: unknown): HintImages | undefined {
  if (typeof event !== "object" || event === null) return undefined;
  const images = (event as { [IMAGES]?: unknown })[IMAGES];
  return typeof images === "object" && images !== null ? (images as HintImages) : undefined;
}

/** The key of the rules of a collection on the metadata of its procedures. */
const RULES: unique symbol = Symbol.for("procedures.collectionRules");

/**
 * This function puts the rules of a collection on the metadata of its procedures, so the publisher
 * of the events finds them in the registry. The key is not enumerable.
 */
export function withCollectionRules(procedures: AnyProcedure[], admission: CollectionAdmission | undefined): AnyProcedure[] {
  for (const procedure of procedures) {
    const metadata = procedure.metadata as object | undefined;
    if (metadata) Object.defineProperty(metadata, RULES, { value: { admission }, enumerable: false, configurable: true });
  }
  return procedures;
}

/**
 * The rules of a collection in the registry of a call. It gives the rules, or `null` for a
 * collection without rules. It gives undefined when the registry does not know the procedures.
 */
export function collectionRulesOf(ctx: ProcedureContext, collection: string): CollectionAdmission | null | undefined {
  const registry = ctx.registry;
  if (!registry) return undefined;
  for (const operation of ["changes", "get"]) {
    const metadata = registry.get(["collections", collection, operation])?.metadata as { [RULES]?: { admission?: CollectionAdmission | undefined } } | undefined;
    const rules = metadata?.[RULES];
    if (rules) return rules.admission ?? null;
  }
  return undefined;
}

/**
 * The invocation that the rules of a collection get for the events of one topic (roadmap CLI-78).
 * It has the principal, the capability, the metadata and the signal of the subscription. Its path
 * is the path of `changes` of the collection, and its input has the partition of the topic. Thus
 * a rule that reads `invocation.input.partition` sees the same input as in a read of the topic.
 *
 * @param base - The invocation of the subscription
 * @param ctx - The context of the subscription. Its registry gives the procedure of `changes`.
 * @param collection - The collection of the topic
 * @param partition - The partition that the topic names, before the resolver
 */
export function collectionInvocation(base: Invocation | undefined, ctx: ProcedureContext, collection: string, partition: string | undefined): Invocation | undefined {
  if (base === undefined) return undefined;
  const procedure = ctx.registry?.get(["collections", collection, "changes"]);
  return {
    ...base,
    ...(procedure !== undefined && { procedure, path: procedure.path }),
    input: partition === undefined ? {} : { partition },
  };
}

/** The subscriptions with a row filter, by bus and by topic: the writes read the rows before them only for these. */
const FILTERED = new WeakMap<object, Map<string, number>>();

/** The key of the bus under a view of a bus (`withEventBusSignal()`). */
const BASE_BUS = Symbol.for("procedures.baseBus");

/** The bus under a view of a bus, or the bus itself. */
function baseOf(bus: EventBus): object {
  return ((bus as { [BASE_BUS]?: EventBus })[BASE_BUS] as object | undefined) ?? bus;
}

/**
 * This function marks a topic of a bus: a subscription of the topic has a row filter. It gives the
 * function that removes the mark. A second call of that function does nothing.
 */
export function markFilteredTopic(bus: EventBus, topic: string): () => void {
  const base = baseOf(bus);
  let topics = FILTERED.get(base);
  if (!topics) {
    topics = new Map();
    FILTERED.set(base, topics);
  }
  topics.set(topic, (topics.get(topic) ?? 0) + 1);
  let marked = true;
  return () => {
    if (!marked) return;
    marked = false;
    const count = (topics.get(topic) ?? 1) - 1;
    if (count > 0) topics.set(topic, count);
    else topics.delete(topic);
  };
}

/** True when a subscription of the topic of the bus has a row filter. */
export function hasFilteredSubscriber(bus: EventBus, topic: string): boolean {
  return (FILTERED.get(baseOf(bus))?.get(topic) ?? 0) > 0;
}

/** The result of the filter for an event that the subscriber does not get. */
export const DROPPED: unique symbol = Symbol("procedures.droppedHint");

/**
 * The mode of a filter. `pass` gives each event as before CLI-78, and `filter` examines each row.
 * `unknown` uses the rules of the images of each event.
 */
export type HintFilterMode = "pass" | "filter" | "unknown";

/** The fields of a change event that the filter reads. */
interface ChangeEventShape {
  readonly since?: unknown;
  readonly version?: unknown;
  readonly changed: readonly string[];
  readonly deleted: readonly string[];
  readonly values?: ReadonlyArray<{ readonly id: string; readonly value: unknown }> | undefined;
  readonly versions?: ReadonlyArray<{ readonly id: string; readonly version: string }> | undefined;
  readonly reset?: unknown;
  readonly origin?: unknown;
}

/** True for a value with the shape of a change event: the arrays `changed` and `deleted`. */
function isChangeEvent(data: unknown): data is ChangeEventShape {
  if (typeof data !== "object" || data === null) return false;
  const event = data as { changed?: unknown; deleted?: unknown };
  return Array.isArray(event.changed) && Array.isArray(event.deleted);
}

/** The fields `version` and `origin` of an event, when they are strings. */
function headOf(event: ChangeEventShape): { version?: string; origin?: string } {
  return {
    ...(typeof event.version === "string" && { version: event.version }),
    ...(typeof event.origin === "string" && { origin: event.origin }),
  };
}

/** What the rule tells of one row: admitted, refused, or unknown (no image, or an error). */
type Verdict = boolean | undefined;

/** This function does nothing: the end of a filter that failed. */
function ignore(): void {}

/**
 * The row filter of one topic of one subscription (roadmap CLI-78). The publisher gives each event
 * of the topic to `apply()`, one at a time, in the order of the bus.
 */
export class RowHintFilter {
  /** The rules from the registry: undefined when the registry does not know the collection. */
  private rules: CollectionAdmission | null | undefined;
  /** The result of `admitsAll` for one set of rules. */
  private all: { readonly admission: CollectionAdmission; readonly value: boolean } | undefined;
  /** The `version` of the last event of the chain, also of an event that the subscriber did not get. */
  private head: string | undefined;
  /** The `since` that the next event of the chain gets: the `version` of the last event that the subscriber got. */
  private base: string | undefined;
  /** The filters, one at a time. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    /** The rules of the collection from the registry of the call. */
    private readonly lookup: () => CollectionAdmission | null | undefined,
    /** The invocation of the topic (`collectionInvocation()`): the rules get it. */
    readonly invocation: Invocation | undefined,
    /** The partition of the topic: `admitsAll` gets it. */
    private readonly partition: string | undefined,
  ) {
    this.rules = lookup();
  }

  /** The mode of the filter, from the rules and from the last result of `admitsAll`. */
  get mode(): HintFilterMode {
    const rules = this.rules;
    if (rules === undefined) return "unknown";
    if (rules === null || !rules.admit) return "pass";
    return this.all?.admission === rules && this.all.value ? "pass" : "filter";
  }

  /**
   * This function reads the rules again and asks `admitsAll` again: at the start of the
   * subscription and at each re-check (roadmap CLI-44). It gives the new mode.
   */
  async refresh(): Promise<HintFilterMode> {
    this.rules = this.lookup();
    this.all = undefined;
    if (this.rules?.admit) await this.admitsAll(this.rules);
    return this.mode;
  }

  /** This function forgets the chain: the next event keeps its own `since`. */
  forget(): void {
    this.head = undefined;
    this.base = undefined;
  }

  /**
   * The event for the subscriber. It gives undefined when the event passes as it is (no wait).
   * Otherwise it gives a promise of the event for the subscriber, or of `DROPPED` for no event.
   */
  apply(data: unknown): Promise<unknown> | undefined {
    if (!isChangeEvent(data)) return undefined;
    const mode = this.mode;
    if (mode === "pass") return undefined;
    const admission = this.rules ?? hintImagesOf(data)?.admission;
    if (!admission?.admit) return undefined;
    const run = this.tail.then(() => this.filter(data, admission));
    this.tail = run.catch(ignore);
    return run;
  }

  /** The result of `admitsAll` for a set of rules. An error gives false. */
  private async admitsAll(admission: CollectionAdmission): Promise<boolean> {
    if (this.all?.admission === admission) return this.all.value;
    let value = false;
    const invocation = this.invocation;
    if (admission.admitsAll && invocation) {
      try {
        value = (await admission.admitsAll(invocation, this.partition)) === true;
      } catch {
        value = false;
      }
    }
    this.all = { admission, value };
    return value;
  }

  /** The filter of one event with the rule of the rows. */
  private async filter(event: ChangeEventShape, admission: CollectionAdmission): Promise<unknown> {
    // Rules from the images of an event: the subscriber can read each row
    if (await this.admitsAll(admission)) return event;
    if (event.reset === true) {
      this.forget();
      return { ...headOf(event), changed: [], deleted: [], reset: true };
    }
    const since = typeof event.since === "string" ? event.since : undefined;
    if (event.changed.length === 0 && event.deleted.length === 0) {
      if (since === undefined) {
        // A hint: the subscriber reads the changes through the rule of the reads
        this.forget();
        return { ...headOf(event), changed: [], deleted: [] };
      }
      return this.skip(since, event);
    }
    const admit = admission.admit!;
    const invocation = this.invocation;
    const images = hintImagesOf(event);
    const verdict = async (id: string, state: HintRowState | undefined): Promise<Verdict> => {
      if (state === undefined) return undefined;
      if (!state.found || invocation === undefined) return false;
      try {
        return (await admit({ id, value: state.value }, invocation)) === true;
      } catch {
        return undefined;
      }
    };
    const before = (id: string): Promise<Verdict> => verdict(id, images?.before?.get(id));
    const changed = await Promise.all(
      event.changed.map(async (id): Promise<"changed" | "deleted" | "none" | undefined> => {
        const now = await verdict(id, images?.after?.get(id));
        if (now === true) return "changed";
        if (now === undefined) return undefined;
        // The row left the rule, or it has no item: a delete for a subscriber that had it
        const was = await before(id);
        return was === undefined ? undefined : was ? "deleted" : "none";
      }),
    );
    const deleted = await Promise.all(event.deleted.map(before));
    if (changed.includes(undefined) || deleted.includes(undefined)) {
      // The filter cannot tell the rows: the subscriber reads the changes through the rule of the reads
      this.forget();
      return { ...headOf(event), changed: [], deleted: [] };
    }
    const visible = event.changed.filter((_, index) => changed[index] === "changed");
    const gone = [...event.changed.filter((_, index) => changed[index] === "deleted"), ...event.deleted.filter((_, index) => deleted[index] === true)];
    if (visible.length === 0 && gone.length === 0) {
      if (since === undefined) return DROPPED;
      return this.skip(since, event);
    }
    const kept = new Set(visible);
    const chained = since === undefined ? undefined : since === this.head ? this.base : since;
    if (since !== undefined && typeof event.version === "string") {
      this.head = event.version;
      this.base = event.version;
    } else {
      this.forget();
    }
    const out = {
      ...(chained !== undefined && { since: chained }),
      ...(typeof event.version === "string" && { version: event.version }),
      changed: visible,
      deleted: gone,
      ...(event.versions && { versions: event.versions.filter(({ id }) => kept.has(id)) }),
      ...(typeof event.origin === "string" && { origin: event.origin }),
    };
    if (!event.values) return out;
    const values = event.values.filter(({ id }) => kept.has(id));
    // The rows pass the output filter of the host for the subscriber, as before
    return withRows(
      { ...out, values },
      {
        rows: values,
        keep: (admitted) => {
          const withheld = values.filter((_, index) => !admitted[index]).map(({ id }) => id);
          return { ...out, values: values.filter((_, index) => admitted[index]), ...(withheld.length > 0 && { withheld }) };
        },
      },
    );
  }

  /** An event of the chain that the subscriber does not get: the next event keeps the `since` of the last one. */
  private skip(since: string, event: ChangeEventShape): typeof DROPPED {
    const chained = since === this.head ? this.base : since;
    if (typeof event.version === "string" && chained !== undefined) {
      this.head = event.version;
      this.base = chained;
    } else {
      this.forget();
    }
    return DROPPED;
  }
}
