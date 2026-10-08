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
// =============================================================================
// Logic Operator Factories
// =============================================================================
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
export function variadicLogic(shortCircuitOn) {
    return async (input) => {
        const { values } = input;
        for (const value of values) {
            if (shortCircuitOn(value)) {
                return value; // Short-circuit return
            }
        }
        // Return last value if no short-circuit triggered
        return values[values.length - 1];
    };
}
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
export function unaryLogic(transform) {
    return async (input) => {
        return transform(input.value);
    };
}
/**
 * AND handler - returns first falsy or last value.
 * Short-circuits on falsy.
 */
export const andHandler = variadicLogic(v => !v);
/**
 * OR handler - returns first truthy or last value.
 * Short-circuits on truthy.
 */
export const orHandler = variadicLogic(v => !!v);
/**
 * NOT handler - returns boolean negation.
 */
export const notHandler = unaryLogic(v => !v);
/**
 * ALL handler - alias for AND with boolean result.
 * Returns true if all values are truthy.
 */
export const allHandler = async (input) => {
    return input.values.every(v => !!v);
};
/**
 * ANY handler - alias for OR with boolean result.
 * Returns true if any value is truthy.
 */
export const anyHandler = async (input) => {
    return input.values.some(v => !!v);
};
/**
 * NONE handler - returns true if all values are falsy.
 */
export const noneHandler = async (input) => {
    return input.values.every(v => !v);
};
// =============================================================================
// Metadata Definitions
// =============================================================================
/**
 * Metadata for the AND operator.
 */
export const andMetadata = {
    description: "Short-circuit AND (returns first falsy or last value)",
    tags: ["core", "logic"],
    arity: "variadic",
    commutative: true,
    shortCircuit: true,
};
/**
 * Metadata for the OR operator.
 */
export const orMetadata = {
    description: "Short-circuit OR (returns first truthy or last value)",
    tags: ["core", "logic"],
    arity: "variadic",
    commutative: true,
    shortCircuit: true,
};
/**
 * Metadata for the NOT operator.
 */
export const notMetadata = {
    description: "Logical NOT",
    tags: ["core", "logic"],
    arity: "unary",
    commutative: false, // n/a for unary
    shortCircuit: false,
};
/**
 * Metadata for the ALL operator.
 */
export const allMetadata = {
    description: "Returns true if all values are truthy",
    tags: ["core", "logic"],
    arity: "variadic",
    commutative: true,
    shortCircuit: true,
};
/**
 * Metadata for the ANY operator.
 */
export const anyMetadata = {
    description: "Returns true if any value is truthy",
    tags: ["core", "logic"],
    arity: "variadic",
    commutative: true,
    shortCircuit: true,
};
/**
 * Metadata for the NONE operator.
 */
export const noneMetadata = {
    description: "Returns true if all values are falsy",
    tags: ["core", "logic"],
    arity: "variadic",
    commutative: true,
    shortCircuit: true,
};
//# sourceMappingURL=logic.js.map