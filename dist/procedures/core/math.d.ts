/**
 * Math Procedures
 *
 * Arithmetic and mathematical operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.add, client.multiply).
 */
import type { AnyProcedure, Procedure } from "../types.js";
interface AddInput {
    a: number;
    b: number;
}
type AddProcedure = Procedure<AddInput, number, {
    description: string;
    tags: string[];
}>;
declare const addProcedure: AddProcedure;
interface SubtractInput {
    a: number;
    b: number;
}
type SubtractProcedure = Procedure<SubtractInput, number, {
    description: string;
    tags: string[];
}>;
declare const subtractProcedure: SubtractProcedure;
interface MultiplyInput {
    a: number;
    b: number;
}
type MultiplyProcedure = Procedure<MultiplyInput, number, {
    description: string;
    tags: string[];
}>;
declare const multiplyProcedure: MultiplyProcedure;
interface DivideInput {
    a: number;
    b: number;
}
type DivideProcedure = Procedure<DivideInput, number, {
    description: string;
    tags: string[];
}>;
declare const divideProcedure: DivideProcedure;
interface ModInput {
    a: number;
    b: number;
}
type ModProcedure = Procedure<ModInput, number, {
    description: string;
    tags: string[];
}>;
declare const modProcedure: ModProcedure;
interface AbsInput {
    value: number;
}
type AbsProcedure = Procedure<AbsInput, number, {
    description: string;
    tags: string[];
}>;
declare const absProcedure: AbsProcedure;
interface MinInput {
    values: number[];
}
type MinProcedure = Procedure<MinInput, number, {
    description: string;
    tags: string[];
}>;
declare const minProcedure: MinProcedure;
interface MaxInput {
    values: number[];
}
type MaxProcedure = Procedure<MaxInput, number, {
    description: string;
    tags: string[];
}>;
declare const maxProcedure: MaxProcedure;
interface SumInput {
    values: number[];
}
type SumProcedure = Procedure<SumInput, number, {
    description: string;
    tags: string[];
}>;
declare const sumProcedure: SumProcedure;
interface PowInput {
    base: number;
    exp: number;
}
type PowProcedure = Procedure<PowInput, number, {
    description: string;
    tags: string[];
}>;
declare const powProcedure: PowProcedure;
interface SqrtInput {
    value: number;
}
type SqrtProcedure = Procedure<SqrtInput, number, {
    description: string;
    tags: string[];
}>;
declare const sqrtProcedure: SqrtProcedure;
interface FloorInput {
    value: number;
}
type FloorProcedure = Procedure<FloorInput, number, {
    description: string;
    tags: string[];
}>;
declare const floorProcedure: FloorProcedure;
interface CeilInput {
    value: number;
}
type CeilProcedure = Procedure<CeilInput, number, {
    description: string;
    tags: string[];
}>;
declare const ceilProcedure: CeilProcedure;
interface RoundInput {
    value: number;
    decimals?: number;
}
type RoundProcedure = Procedure<RoundInput, number, {
    description: string;
    tags: string[];
}>;
declare const roundProcedure: RoundProcedure;
/**
 * All math procedures namespaced under "client".
 */
export declare const mathProcedures: AnyProcedure[];
/**
 * Math procedures module for registration.
 */
export declare const mathModule: {
    name: string;
    procedures: AnyProcedure[];
};
export { addProcedure, subtractProcedure, multiplyProcedure, divideProcedure, modProcedure, absProcedure, minProcedure, maxProcedure, sumProcedure, powProcedure, sqrtProcedure, floorProcedure, ceilProcedure, roundProcedure, };
//# sourceMappingURL=math.d.ts.map