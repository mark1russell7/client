/**
 * String Procedures
 *
 * String manipulation operations for procedure aggregation.
 * All procedures are namespaced under "client" (e.g., client.concat, client.split).
 */
import type { AnyProcedure, Procedure } from "../types.js";
interface ConcatInput {
    values: string[];
    separator?: string;
}
type ConcatProcedure = Procedure<ConcatInput, string, {
    description: string;
    tags: string[];
}>;
declare const concatProcedure: ConcatProcedure;
interface SplitInput {
    value: string;
    separator: string;
    limit?: number;
}
type SplitProcedure = Procedure<SplitInput, string[], {
    description: string;
    tags: string[];
}>;
declare const splitProcedure: SplitProcedure;
interface JoinInput {
    values: string[];
    separator: string;
}
type JoinProcedure = Procedure<JoinInput, string, {
    description: string;
    tags: string[];
}>;
declare const joinProcedure: JoinProcedure;
interface ReplaceInput {
    value: string;
    search: string;
    replace: string;
    all?: boolean;
}
type ReplaceProcedure = Procedure<ReplaceInput, string, {
    description: string;
    tags: string[];
}>;
declare const replaceProcedure: ReplaceProcedure;
interface SubstringInput {
    value: string;
    start: number;
    end?: number;
}
type SubstringProcedure = Procedure<SubstringInput, string, {
    description: string;
    tags: string[];
}>;
declare const substringProcedure: SubstringProcedure;
interface TrimInput {
    value: string;
    side?: "start" | "end" | "both";
}
type TrimProcedure = Procedure<TrimInput, string, {
    description: string;
    tags: string[];
}>;
declare const trimProcedure: TrimProcedure;
interface ToLowerInput {
    value: string;
}
type ToLowerProcedure = Procedure<ToLowerInput, string, {
    description: string;
    tags: string[];
}>;
declare const toLowerProcedure: ToLowerProcedure;
interface ToUpperInput {
    value: string;
}
type ToUpperProcedure = Procedure<ToUpperInput, string, {
    description: string;
    tags: string[];
}>;
declare const toUpperProcedure: ToUpperProcedure;
interface StartsWithInput {
    value: string;
    search: string;
}
type StartsWithProcedure = Procedure<StartsWithInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const startsWithProcedure: StartsWithProcedure;
interface EndsWithInput {
    value: string;
    search: string;
}
type EndsWithProcedure = Procedure<EndsWithInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const endsWithProcedure: EndsWithProcedure;
interface IncludesInput {
    value: string;
    search: string;
}
type IncludesProcedure = Procedure<IncludesInput, boolean, {
    description: string;
    tags: string[];
}>;
declare const includesProcedure: IncludesProcedure;
interface StrLengthInput {
    value: string;
}
type StrLengthProcedure = Procedure<StrLengthInput, number, {
    description: string;
    tags: string[];
}>;
declare const strLengthProcedure: StrLengthProcedure;
interface TemplateInput {
    template: string;
    values: Record<string, unknown>;
}
type TemplateProcedure = Procedure<TemplateInput, string, {
    description: string;
    tags: string[];
}>;
declare const templateProcedure: TemplateProcedure;
/**
 * All string procedures namespaced under "client".
 */
export declare const stringProcedures: AnyProcedure[];
/**
 * String procedures module for registration.
 */
export declare const stringModule: {
    name: string;
    procedures: AnyProcedure[];
};
export { concatProcedure, splitProcedure, joinProcedure, replaceProcedure, substringProcedure, trimProcedure, toLowerProcedure, toUpperProcedure, startsWithProcedure, endsWithProcedure, includesProcedure, strLengthProcedure, templateProcedure, };
//# sourceMappingURL=string.d.ts.map