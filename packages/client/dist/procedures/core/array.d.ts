/**
 * Array Procedures
 *
 * Array manipulation operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.first, client.filter).
 */
import type { AnyProcedure, Procedure } from "../types.js";
interface FirstInput {
    items: unknown[];
}
type FirstProcedure = Procedure<FirstInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const firstProcedure: FirstProcedure;
interface LastInput {
    items: unknown[];
}
type LastProcedure = Procedure<LastInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const lastProcedure: LastProcedure;
interface NthInput {
    items: unknown[];
    index: number;
}
type NthProcedure = Procedure<NthInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const nthProcedure: NthProcedure;
interface ArrLengthInput {
    items: unknown[];
}
type ArrLengthProcedure = Procedure<ArrLengthInput, number, {
    description: string;
    tags: string[];
}>;
declare const arrLengthProcedure: ArrLengthProcedure;
interface FlattenInput {
    items: unknown[];
    depth?: number;
}
type FlattenProcedure = Procedure<FlattenInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const flattenProcedure: FlattenProcedure;
interface ReverseInput {
    items: unknown[];
}
type ReverseProcedure = Procedure<ReverseInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const reverseProcedure: ReverseProcedure;
interface SortInput {
    items: unknown[];
    key?: string;
    desc?: boolean;
}
type SortProcedure = Procedure<SortInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const sortProcedure: SortProcedure;
interface SliceInput {
    items: unknown[];
    start: number;
    end?: number;
}
type SliceProcedure = Procedure<SliceInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const sliceProcedure: SliceProcedure;
interface ArrConcatInput {
    arrays: unknown[][];
}
type ArrConcatProcedure = Procedure<ArrConcatInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const arrConcatProcedure: ArrConcatProcedure;
interface UniqueInput {
    items: unknown[];
    key?: string;
}
type UniqueProcedure = Procedure<UniqueInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const uniqueProcedure: UniqueProcedure;
interface GroupByInput {
    items: unknown[];
    key: string;
}
type GroupByProcedure = Procedure<GroupByInput, Record<string, unknown[]>, {
    description: string;
    tags: string[];
}>;
declare const groupByProcedure: GroupByProcedure;
interface ZipInput {
    arrays: unknown[][];
}
type ZipProcedure = Procedure<ZipInput, unknown[][], {
    description: string;
    tags: string[];
}>;
declare const zipProcedure: ZipProcedure;
interface UnzipInput {
    tuples: unknown[][];
}
type UnzipProcedure = Procedure<UnzipInput, unknown[][], {
    description: string;
    tags: string[];
}>;
declare const unzipProcedure: UnzipProcedure;
interface IndexOfInput {
    items: unknown[];
    value: unknown;
    fromIndex?: number;
}
type IndexOfProcedure = Procedure<IndexOfInput, number, {
    description: string;
    tags: string[];
}>;
declare const indexOfProcedure: IndexOfProcedure;
interface ContainsInput {
    items: unknown[];
    value: unknown;
}
type ContainsProcedure = Procedure<ContainsInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const containsProcedure: ContainsProcedure;
interface PushInput {
    items: unknown[];
    value: unknown;
}
type PushProcedure = Procedure<PushInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const pushProcedure: PushProcedure;
interface UnshiftInput {
    items: unknown[];
    value: unknown;
}
type UnshiftProcedure = Procedure<UnshiftInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const unshiftProcedure: UnshiftProcedure;
interface RangeInput {
    start: number;
    end: number;
    step?: number;
}
type RangeProcedure = Procedure<RangeInput, number[], {
    description: string;
    tags: string[];
}>;
declare const rangeProcedure: RangeProcedure;
interface FilterInput {
    /** Array to filter */
    items: unknown[];
    /** Property to match against */
    key?: string;
    /** Value to match (equality check) */
    value?: unknown;
    /** Values to match (any of these) */
    values?: unknown[];
    /** Match mode: 'equals', 'not', 'in', 'notIn', 'contains', 'startsWith', 'endsWith' */
    match?: 'equals' | 'not' | 'in' | 'notIn' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'gte' | 'lt' | 'lte';
    /** Invert the filter */
    invert?: boolean;
}
type FilterProcedure = Procedure<FilterInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const filterProcedure: FilterProcedure;
interface WhereInput {
    /** Array to filter */
    items: unknown[];
    /** Object with key-value pairs to match */
    where: Record<string, unknown>;
}
type WhereProcedure = Procedure<WhereInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const whereProcedure: WhereProcedure;
interface PluckInput {
    /** Array of objects */
    items: unknown[];
    /** Property to extract */
    key: string;
}
type PluckProcedure = Procedure<PluckInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const pluckProcedure: PluckProcedure;
interface ArrPickInput {
    /** Array of objects */
    items: unknown[];
    /** Properties to keep */
    keys: string[];
}
type ArrPickProcedure = Procedure<ArrPickInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const arrPickProcedure: ArrPickProcedure;
interface ArrOmitInput {
    /** Array of objects */
    items: unknown[];
    /** Properties to remove */
    keys: string[];
}
type ArrOmitProcedure = Procedure<ArrOmitInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const arrOmitProcedure: ArrOmitProcedure;
interface PartitionInput {
    /** Array to partition */
    items: unknown[];
    /** Property to check for truthiness */
    key: string;
    /** Value to match for truthy partition */
    value?: unknown;
}
interface PartitionOutput {
    /** Items that matched */
    truthy: unknown[];
    /** Items that didn't match */
    falsy: unknown[];
}
type PartitionProcedure = Procedure<PartitionInput, PartitionOutput, {
    description: string;
    tags: string[];
}>;
declare const partitionProcedure: PartitionProcedure;
interface CountInput {
    /** Array to count */
    items: unknown[];
    /** Optional property to check for truthiness */
    key?: string;
    /** Optional value to match */
    value?: unknown;
}
type CountProcedure = Procedure<CountInput, number, {
    description: string;
    tags: string[];
}>;
declare const countProcedure: CountProcedure;
/**
 * All array procedures namespaced under "client".
 */
export declare const arrayProcedures: AnyProcedure[];
/**
 * Array procedures module for registration.
 */
export declare const arrayModule: {
    name: string;
    procedures: AnyProcedure[];
};
export { firstProcedure, lastProcedure, nthProcedure, arrLengthProcedure, flattenProcedure, reverseProcedure, sortProcedure, sliceProcedure, arrConcatProcedure, uniqueProcedure, groupByProcedure, zipProcedure, unzipProcedure, indexOfProcedure, containsProcedure, pushProcedure, unshiftProcedure, rangeProcedure, filterProcedure, whereProcedure, pluckProcedure, arrPickProcedure, arrOmitProcedure, partitionProcedure, countProcedure, };
//# sourceMappingURL=array.d.ts.map