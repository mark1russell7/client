/**
 * The cases of the delete bench (roadmap CLI-98). A case is `<kind>-<partitions>-<route>`.
 *
 * - The kind `one` is one delete in one partition. The kind `hot` is a burst of `HOT_DELETES` deletes
 *   in one partition. The kind `each` is one delete in each partition.
 * - The route `none` has no pre-image and no rule. The route `image` has pre-images on the source.
 *   The route `rule` has an entry in `storageSources`.
 */

/** The partitions of the cases. */
const PARTITIONS = [1, 100, 1000] as const;

/** The ways that a delete finds its partition. */
const ROUTES = ["none", "image", "rule"] as const;

/** The kinds of delete. */
const KINDS = ["one", "hot", "each"] as const;

/** The way that a delete finds its partition. */
export type DeleteRoute = (typeof ROUTES)[number];

/** A kind of delete. */
export type DeleteKind = (typeof KINDS)[number];

/** The deletes of a burst in one partition. */
export const HOT_DELETES = 100;

/** All cases. With one partition, the kind `each` is the kind `one`, so the list has no such case. */
export const DELETE_CASES: readonly string[] = PARTITIONS.flatMap((partitions) =>
  KINDS.filter((kind) => partitions > 1 || kind !== "each").flatMap((kind) => ROUTES.map((route) => `${kind}-${partitions}-${route}`))
);

/** This function reads a case. */
export function parseDeleteCase(id: string): { readonly kind: DeleteKind; readonly partitions: number; readonly route: DeleteRoute } {
  const [kind, partitions, route] = id.split("-");
  if (!KINDS.includes(kind as DeleteKind) || !ROUTES.includes(route as DeleteRoute) || !Number.isInteger(Number(partitions))) throw new RangeError(`this case is not known: ${id}`);
  return { kind: kind as DeleteKind, partitions: Number(partitions), route: route as DeleteRoute };
}

/** One line of the counts of a child. A time is in milliseconds. */
export interface DeleteCount {
  readonly job: string;
  readonly case: string;
  /** False when the passes did not end before the cap. */
  readonly ended: boolean;
  /** The time from the delete to the end of the last pass. */
  readonly passesMs: number;
  /** The time of the delete command, because a pre-image costs a write. */
  readonly deleteMs: number;
  /** The `aggregate` commands on the source after the delete: one for each pass of a view. */
  readonly sourceReads: number;
  /** The commands of the materializer after the delete, except `getMore` and the commands of the driver. */
  readonly commands: number;
  /** The longest block of the event loop after the delete. */
  readonly blockMs: number;
  /** The warnings and the errors of the materializer in this child, as `<level>: <message>` with the count of each. */
  readonly logged: Readonly<Record<string, number>>;
}
