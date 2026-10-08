/**
 * Type Procedures
 *
 * Type checking and coercion operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.typeof, client.isArray).
 */
import type { AnyProcedure, Procedure } from "../types.js";
interface TypeofInput {
    value: unknown;
}
type TypeofProcedure = Procedure<TypeofInput, string, {
    description: string;
    tags: string[];
}>;
declare const typeofProcedure: TypeofProcedure;
interface IsNullInput {
    value: unknown;
}
type IsNullProcedure = Procedure<IsNullInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const isNullProcedure: IsNullProcedure;
interface IsUndefinedInput {
    value: unknown;
}
type IsUndefinedProcedure = Procedure<IsUndefinedInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const isUndefinedProcedure: IsUndefinedProcedure;
interface IsNilInput {
    value: unknown;
}
type IsNilProcedure = Procedure<IsNilInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const isNilProcedure: IsNilProcedure;
interface IsArrayInput {
    value: unknown;
}
type IsArrayProcedure = Procedure<IsArrayInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const isArrayProcedure: IsArrayProcedure;
interface IsObjectInput {
    value: unknown;
}
type IsObjectProcedure = Procedure<IsObjectInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const isObjectProcedure: IsObjectProcedure;
interface IsStringInput {
    value: unknown;
}
type IsStringProcedure = Procedure<IsStringInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const isStringProcedure: IsStringProcedure;
interface IsNumberInput {
    value: unknown;
}
type IsNumberProcedure = Procedure<IsNumberInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const isNumberProcedure: IsNumberProcedure;
interface IsBooleanInput {
    value: unknown;
}
type IsBooleanProcedure = Procedure<IsBooleanInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const isBooleanProcedure: IsBooleanProcedure;
interface CoerceInput {
    value: unknown;
    to: "string" | "number" | "boolean" | "array";
}
type CoerceProcedure = Procedure<CoerceInput, unknown, {
    description: string;
    tags: string[];
}>;
declare const coerceProcedure: CoerceProcedure;
/**
 * All type procedures namespaced under "client".
 */
export declare const typeProcedures: AnyProcedure[];
/**
 * Type procedures module for registration.
 */
export declare const typeModule: {
    name: string;
    procedures: AnyProcedure[];
};
export { typeofProcedure, isNullProcedure, isUndefinedProcedure, isNilProcedure, isArrayProcedure, isObjectProcedure, isStringProcedure, isNumberProcedure, isBooleanProcedure, coerceProcedure, };
//# sourceMappingURL=type.d.ts.map