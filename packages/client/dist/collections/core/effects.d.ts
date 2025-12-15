/**
 * Functional effect types for error handling and optional values.
 *
 * Provides Option<T> and Result<T,E> types for explicit, type-safe
 * error handling without exceptions. Includes async variants.
 */
/**
 * Represents the absence of a value.
 */
export interface None {
    readonly _tag: "None";
}
/**
 * Represents the presence of a value.
 */
export interface Some<T> {
    readonly _tag: "Some";
    readonly value: T;
}
/**
 * Option<T> represents a value that may or may not be present.
 * This is a type-safe alternative to null/undefined.
 *
 * @example
 * function findUser(id: string): Option<User> {
 *   const user = db.get(id);
 *   return user ? Some(user) : None;
 * }
 */
export type Option<T> = None | Some<T>;
/**
 * The singleton None value.
 */
export declare const None: None;
/**
 * Constructs a Some value containing the given value.
 */
export declare const Some: <T>(value: T) => Some<T>;
/**
 * Type guard to check if an Option is None.
 */
export declare const isNone: <T>(opt: Option<T>) => opt is None;
/**
 * Type guard to check if an Option is Some.
 */
export declare const isSome: <T>(opt: Option<T>) => opt is Some<T>;
/**
 * Extracts the value from a Some, or returns the default value if None.
 */
export declare const getOrElse: <T>(opt: Option<T>, defaultValue: T) => T;
/**
 * Extracts the value from a Some, or throws an error if None.
 */
export declare const unwrap: <T>(opt: Option<T>) => T;
/**
 * Maps a function over the value in a Some, or returns None.
 */
export declare const mapOption: <T, U>(opt: Option<T>, f: (value: T) => U) => Option<U>;
/**
 * Chains Option-returning operations.
 */
export declare const flatMapOption: <T, U>(opt: Option<T>, f: (value: T) => Option<U>) => Option<U>;
/**
 * Converts a nullable value to an Option.
 */
export declare const fromNullable: <T>(value: T | null | undefined) => Option<T>;
/**
 * Converts an Option to a nullable value.
 */
export declare const toNullable: <T>(opt: Option<T>) => T | undefined;
/**
 * Represents a successful result containing a value.
 */
export interface Ok<T> {
    readonly _tag: "Ok";
    readonly value: T;
}
/**
 * Represents a failed result containing an error.
 */
export interface Err<E> {
    readonly _tag: "Err";
    readonly error: E;
}
/**
 * Result<T, E> represents the result of an operation that may fail.
 * It contains either a success value (Ok) or an error value (Err).
 *
 * @example
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return Err("Division by zero");
 *   return Ok(a / b);
 * }
 */
export type Result<T, E> = Ok<T> | Err<E>;
/**
 * Constructs an Ok result containing the given value.
 */
export declare const Ok: <T>(value: T) => Ok<T>;
/**
 * Constructs an Err result containing the given error.
 */
export declare const Err: <E>(error: E) => Err<E>;
/**
 * Type guard to check if a Result is Ok.
 */
export declare const isOk: <T, E>(result: Result<T, E>) => result is Ok<T>;
/**
 * Type guard to check if a Result is Err.
 */
export declare const isErr: <T, E>(result: Result<T, E>) => result is Err<E>;
/**
 * Extracts the value from an Ok, or returns the default value if Err.
 */
export declare const getOrElseResult: <T, E>(result: Result<T, E>, defaultValue: T) => T;
/**
 * Extracts the value from an Ok, or throws the error if Err.
 */
export declare const unwrapResult: <T, E>(result: Result<T, E>) => T;
/**
 * Maps a function over the value in an Ok, or returns the Err unchanged.
 */
export declare const mapResult: <T, U, E>(result: Result<T, E>, f: (value: T) => U) => Result<U, E>;
/**
 * Maps a function over the error in an Err, or returns the Ok unchanged.
 */
export declare const mapError: <T, E, F>(result: Result<T, E>, f: (error: E) => F) => Result<T, F>;
/**
 * Chains Result-returning operations.
 */
export declare const flatMapResult: <T, U, E>(result: Result<T, E>, f: (value: T) => Result<U, E>) => Result<U, E>;
/**
 * Converts a throwing function into a Result-returning function.
 */
export declare const tryCatch: <T, E = unknown>(fn: () => T, onError?: (error: unknown) => E) => Result<T, E>;
/**
 * Converts an async throwing function into a Result-returning async function.
 */
export declare const tryCatchAsync: <T, E = unknown>(fn: () => Promise<T>, onError?: (error: unknown) => E) => Promise<Result<T, E>>;
/**
 * Async variant of Option<T>.
 */
export type AsyncOption<T> = Promise<Option<T>>;
/**
 * Async variant of Result<T, E>.
 */
export type AsyncResult<T, E> = Promise<Result<T, E>>;
/**
 * Maps a function over an async Option.
 */
export declare const mapAsyncOption: <T, U>(opt: AsyncOption<T>, f: (value: T) => U | Promise<U>) => AsyncOption<U>;
/**
 * Maps a function over an async Result.
 */
export declare const mapAsyncResult: <T, U, E>(result: AsyncResult<T, E>, f: (value: T) => U | Promise<U>) => AsyncResult<U, E>;
/**
 * Converts an Option to a Result.
 * None becomes Err with the provided error.
 */
export declare const optionToResult: <T, E>(opt: Option<T>, error: E) => Result<T, E>;
/**
 * Converts a Result to an Option.
 * Err becomes None, discarding the error.
 */
export declare const resultToOption: <T, E>(result: Result<T, E>) => Option<T>;
/**
 * Combines multiple Options into an Option of an array.
 * Returns None if any input is None.
 */
export declare const sequence: <T>(opts: Option<T>[]) => Option<T[]>;
/**
 * Combines multiple Results into a Result of an array.
 * Returns the first Err encountered, or Ok with all values.
 */
export declare const sequenceResults: <T, E>(results: Result<T, E>[]) => Result<T[], E>;
//# sourceMappingURL=effects.d.ts.map