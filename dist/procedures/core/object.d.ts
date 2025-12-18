/**
 * Object Procedures
 *
 * Object manipulation operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.get, client.set).
 */
import type { AnyProcedure, Procedure } from "../types.js";
interface GetInput {
    object: Record<string, unknown>;
    path: string;
    default?: unknown;
}
type GetProcedure = Procedure<GetInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const getProcedure: GetProcedure;
interface SetInput {
    object: Record<string, unknown>;
    path: string;
    value: unknown;
}
type SetProcedure = Procedure<SetInput, Record<string, unknown>, {
    description: string;
    tags: string[];
}>;
declare const setProcedure: SetProcedure;
interface MergeInput {
    objects: Record<string, unknown>[];
    deep?: boolean;
}
type MergeProcedure = Procedure<MergeInput, Record<string, unknown>, {
    description: string;
    tags: string[];
}>;
declare const mergeProcedure: MergeProcedure;
interface KeysInput {
    object: Record<string, unknown>;
}
type KeysProcedure = Procedure<KeysInput, string[], {
    description: string;
    tags: string[];
}>;
declare const keysProcedure: KeysProcedure;
interface ValuesInput {
    object: Record<string, unknown>;
}
type ValuesProcedure = Procedure<ValuesInput, unknown[], {
    description: string;
    tags: string[];
}>;
declare const valuesProcedure: ValuesProcedure;
interface EntriesInput {
    object: Record<string, unknown>;
}
type EntriesOutput = Array<[string, unknown]>;
type EntriesProcedure = Procedure<EntriesInput, EntriesOutput, {
    description: string;
    tags: string[];
}>;
declare const entriesProcedure: EntriesProcedure;
interface FromEntriesInput {
    entries: Array<[string, unknown]>;
}
type FromEntriesProcedure = Procedure<FromEntriesInput, Record<string, unknown>, {
    description: string;
    tags: string[];
}>;
declare const fromEntriesProcedure: FromEntriesProcedure;
interface PickInput {
    object: Record<string, unknown>;
    keys: string[];
}
type PickProcedure = Procedure<PickInput, Record<string, unknown>, {
    description: string;
    tags: string[];
}>;
declare const pickProcedure: PickProcedure;
interface OmitInput {
    object: Record<string, unknown>;
    keys: string[];
}
type OmitProcedure = Procedure<OmitInput, Record<string, unknown>, {
    description: string;
    tags: string[];
}>;
declare const omitProcedure: OmitProcedure;
interface HasInput {
    object: Record<string, unknown>;
    path: string;
}
type HasProcedure = Procedure<HasInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const hasProcedure: HasProcedure;
/**
 * All object procedures namespaced under "client".
 */
export declare const objectProcedures: AnyProcedure[];
/**
 * Object procedures module for registration.
 */
export declare const objectModule: {
    name: string;
    procedures: AnyProcedure[];
};
export { getProcedure, setProcedure, mergeProcedure, keysProcedure, valuesProcedure, entriesProcedure, fromEntriesProcedure, pickProcedure, omitProcedure, hasProcedure, };
//# sourceMappingURL=object.d.ts.map