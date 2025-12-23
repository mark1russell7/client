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
// Logic Metadata
// =============================================================================

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
export function variadicLogic(
  shortCircuitOn: (value: unknown) => boolean
): (input: { values: unknown[] }) => Promise<unknown> {
  return async (input: { values: unknown[] }): Promise<unknown> => {
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
export function unaryLogic<T>(
  transform: (value: unknown) => T
): (input: { value: unknown }) => Promise<T> {
  return async (input: { value: unknown }): Promise<T> => {
    return transform(input.value);
  };
}

// =============================================================================
// Pre-built Handlers
// =============================================================================

/**
 * Handler type for variadic logic operators.
 */
export type VariadicLogicHandler = (input: { values: unknown[] }) => Promise<unknown>;

/**
 * Handler type for unary logic operators.
 */
export type UnaryLogicHandler = (input: { value: unknown }) => Promise<boolean>;

/**
 * AND handler - returns first falsy or last value.
 * Short-circuits on falsy.
 */
export const andHandler: VariadicLogicHandler = variadicLogic(v => !v);

/**
 * OR handler - returns first truthy or last value.
 * Short-circuits on truthy.
 */
export const orHandler: VariadicLogicHandler = variadicLogic(v => !!v);

/**
 * NOT handler - returns boolean negation.
 */
export const notHandler: UnaryLogicHandler = unaryLogic(v => !v);

/**
 * ALL handler - alias for AND with boolean result.
 * Returns true if all values are truthy.
 */
export const allHandler = async (input: { values: unknown[] }): Promise<boolean> => {
  return input.values.every(v => !!v);
};

/**
 * ANY handler - alias for OR with boolean result.
 * Returns true if any value is truthy.
 */
export const anyHandler = async (input: { values: unknown[] }): Promise<boolean> => {
  return input.values.some(v => !!v);
};

/**
 * NONE handler - returns true if all values are falsy.
 */
export const noneHandler = async (input: { values: unknown[] }): Promise<boolean> => {
  return input.values.every(v => !v);
};

// =============================================================================
// Metadata Definitions
// =============================================================================

/**
 * Metadata for the AND operator.
 */
export const andMetadata: LogicMetadata = {
  description: "Short-circuit AND (returns first falsy or last value)",
  tags: ["core", "logic"],
  arity: "variadic",
  commutative: true,
  shortCircuit: true,
};

/**
 * Metadata for the OR operator.
 */
export const orMetadata: LogicMetadata = {
  description: "Short-circuit OR (returns first truthy or last value)",
  tags: ["core", "logic"],
  arity: "variadic",
  commutative: true,
  shortCircuit: true,
};

/**
 * Metadata for the NOT operator.
 */
export const notMetadata: LogicMetadata = {
  description: "Logical NOT",
  tags: ["core", "logic"],
  arity: "unary",
  commutative: false, // n/a for unary
  shortCircuit: false,
};

/**
 * Metadata for the ALL operator.
 */
export const allMetadata: LogicMetadata = {
  description: "Returns true if all values are truthy",
  tags: ["core", "logic"],
  arity: "variadic",
  commutative: true,
  shortCircuit: true,
};

/**
 * Metadata for the ANY operator.
 */
export const anyMetadata: LogicMetadata = {
  description: "Returns true if any value is truthy",
  tags: ["core", "logic"],
  arity: "variadic",
  commutative: true,
  shortCircuit: true,
};

/**
 * Metadata for the NONE operator.
 */
export const noneMetadata: LogicMetadata = {
  description: "Returns true if all values are falsy",
  tags: ["core", "logic"],
  arity: "variadic",
  commutative: true,
  shortCircuit: true,
};
