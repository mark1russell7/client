/**
 * Comparison Procedures
 *
 * Equality and relational comparison operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.eq, client.gt).
 */
import type { AnyProcedure, Procedure } from "../types.js";
interface EqInput {
    a: unknown;
    b: unknown;
}
type EqProcedure = Procedure<EqInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const eqProcedure: EqProcedure;
interface NeqInput {
    a: unknown;
    b: unknown;
}
type NeqProcedure = Procedure<NeqInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const neqProcedure: NeqProcedure;
interface GtInput {
    a: number;
    b: number;
}
type GtProcedure = Procedure<GtInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const gtProcedure: GtProcedure;
interface GteInput {
    a: number;
    b: number;
}
type GteProcedure = Procedure<GteInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const gteProcedure: GteProcedure;
interface LtInput {
    a: number;
    b: number;
}
type LtProcedure = Procedure<LtInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const ltProcedure: LtProcedure;
interface LteInput {
    a: number;
    b: number;
}
type LteProcedure = Procedure<LteInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const lteProcedure: LteProcedure;
interface BetweenInput {
    value: number;
    min: number;
    max: number;
    inclusive?: boolean;
}
type BetweenProcedure = Procedure<BetweenInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const betweenProcedure: BetweenProcedure;
/**
 * All comparison procedures namespaced under "client".
 */
export declare const comparisonProcedures: AnyProcedure[];
/**
 * Comparison procedures module for registration.
 */
export declare const comparisonModule: {
    name: string;
    procedures: AnyProcedure[];
};
export { eqProcedure, neqProcedure, gtProcedure, gteProcedure, ltProcedure, lteProcedure, betweenProcedure, };
//# sourceMappingURL=comparison.d.ts.map