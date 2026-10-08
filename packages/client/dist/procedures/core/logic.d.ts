/**
 * Logic Operators
 *
 * Unified logic operators with group theory annotations.
 *
 * Operator Properties:
 * - **Arity**: unary (1 input) or variadic (n inputs)
 * - **Commutativity**: whether order affects the result
 * - **Short-circuit**: whether evaluation stops early
 *
 * | Operator | Arity    | Commutative | Short-circuit |
 * |----------|----------|-------------|---------------|
 * | and      | variadic | yes*        | yes (first falsy) |
 * | or       | variadic | yes*        | yes (first truthy) |
 * | not      | unary    | n/a         | no |
 * | all      | variadic | yes         | yes (first falsy) |
 * | any      | variadic | yes         | yes (first truthy) |
 *
 * *Note: and/or are commutative for boolean results but the returned
 * value may differ based on order (returns the short-circuiting value).
 */
/**
 * Metadata for logic operators, including algebraic properties.
 * Extends ProcedureMetadata with logic-specific fields.
 */
export interface LogicMetadata {
    description: string;
    tags: string[];
    /** Number of inputs: 'unary' (1) or 'variadic' (n) */
    arity: 'unary' | 'variadic';
    /** Whether the operation is commutative (order-independent for result) */
    commutative: boolean;
    /** Whether the operation short-circuits */
    shortCircuit: boolean;
    /** Index signature for compatibility with ProcedureMetadata */
    [key: string]: unknown;
}
/**
 * Create a variadic logic operator handler.
 *
 * @param shortCircuitOn - Predicate that triggers short-circuit return
 * @returns Handler function for the logic operator
 *
 * @example
 * ```typescript
 * // AND: short-circuit on first falsy value
 * const andHandler = variadicLogic(v => !v);
 *
 * // OR: short-circuit on first truthy value
 * const orHandler = variadicLogic(v => !!v);
 * ```
 */
export declare function variadicLogic(shortCircuitOn: (value: unknown) => boolean): (input: {
    values: unknown[];
}) => Promise<unknown>;
/**
 * Create a unary logic operator handler.
 *
 * @param transform - Transformation function for the value
 * @returns Handler function for the logic operator
 *
 * @example
 * ```typescript
 * // NOT: negate the value
 * const notHandler = unaryLogic(v => !v);
 *
 * // Boolean coercion
 * const boolHandler = unaryLogic(v => !!v);
 * ```
 */
export declare function unaryLogic<T>(transform: (value: unknown) => T): (input: {
    value: unknown;
}) => Promise<T>;
/**
 * Handler type for variadic logic operators.
 */
export type VariadicLogicHandler = (input: {
    values: unknown[];
}) => Promise<unknown>;
/**
 * Handler type for unary logic operators.
 */
export type UnaryLogicHandler = (input: {
    value: unknown;
}) => Promise<boolean>;
/**
 * AND handler - returns first falsy or last value.
 * Short-circuits on falsy.
 */
export declare const andHandler: VariadicLogicHandler;
/**
 * OR handler - returns first truthy or last value.
 * Short-circuits on truthy.
 */
export declare const orHandler: VariadicLogicHandler;
/**
 * NOT handler - returns boolean negation.
 */
export declare const notHandler: UnaryLogicHandler;
/**
 * ALL handler - alias for AND with boolean result.
 * Returns true if all values are truthy.
 */
export declare const allHandler: (input: {
    values: unknown[];
}) => Promise<boolean>;
/**
 * ANY handler - alias for OR with boolean result.
 * Returns true if any value is truthy.
 */
export declare const anyHandler: (input: {
    values: unknown[];
}) => Promise<boolean>;
/**
 * NONE handler - returns true if all values are falsy.
 */
export declare const noneHandler: (input: {
    values: unknown[];
}) => Promise<boolean>;
/**
 * Metadata for the AND operator.
 */
export declare const andMetadata: LogicMetadata;
/**
 * Metadata for the OR operator.
 */
export declare const orMetadata: LogicMetadata;
/**
 * Metadata for the NOT operator.
 */
export declare const notMetadata: LogicMetadata;
/**
 * Metadata for the ALL operator.
 */
export declare const allMetadata: LogicMetadata;
/**
 * Metadata for the ANY operator.
 */
export declare const anyMetadata: LogicMetadata;
/**
 * Metadata for the NONE operator.
 */
export declare const noneMetadata: LogicMetadata;
//# sourceMappingURL=logic.d.ts.map