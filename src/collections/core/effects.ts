/**
 * Functional effect types for error handling and optional values.
 *
 * Provides Option<T> and Result<T,E> types for explicit, type-safe
 * error handling without exceptions. Includes async variants.
 */

// ============================================================================
// Option<T> - represents optional values
// ============================================================================

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
export const None: None = Object.freeze({ _tag: "None" });

/**
 * Constructs a Some value containing the given value.
 */
export const Some = <T>(value: T): Some<T> =>
  Object.freeze({ _tag: "Some", value });

/**
 * Type guard to check if an Option is None.
 */
export const isNone = <T>(opt: Option<T>): opt is None => opt._tag === "None";

/**
 * Type guard to check if an Option is Some.
 */
export const isSome = <T>(opt: Option<T>): opt is Some<T> =>
  opt._tag === "Some";

/**
 * Extracts the value from a Some, or returns the default value if None.
 */
export const getOrElse = <T>(opt: Option<T>, defaultValue: T): T =>
  isSome(opt) ? opt.value : defaultValue;

/**
 * Extracts the value from a Some, or throws an error if None.
 */
export const unwrap = <T>(opt: Option<T>): T => {
  if (isSome(opt)) return opt.value;
  throw new Error("Called unwrap on None");
};

/**
 * Maps a function over the value in a Some, or returns None.
 */
export const mapOption = <T, U>(
  opt: Option<T>,
  f: (value: T) => U
): Option<U> => (isSome(opt) ? Some(f(opt.value)) : None);

/**
 * Chains Option-returning operations.
 */
export const flatMapOption = <T, U>(
  opt: Option<T>,
  f: (value: T) => Option<U>
): Option<U> => (isSome(opt) ? f(opt.value) : None);

/**
 * Converts a nullable value to an Option.
 */
export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value == null ? None : Some(value);

/**
 * Converts an Option to a nullable value.
 */
export const toNullable = <T>(opt: Option<T>): T | undefined =>
  isSome(opt) ? opt.value : undefined;

// ============================================================================
// Result<T, E> - represents success or failure
// ============================================================================

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
export const Ok = <T>(value: T): Ok<T> =>
  Object.freeze({
    _tag: "Ok",
    value,
    match: <U>(f: { Ok: (value: T) => U; Err: (error: unknown) => U }) =>
      f.Ok(value),
  });

/**
 * Constructs an Err result containing the given error.
 */
export const Err = <E>(error: E): Err<E> =>
  Object.freeze({
    _tag: "Err",
    error,
    match: <U>(f: { Ok: (value: unknown) => U; Err: (error: E) => U }) =>
      f.Err(error),
  });

/**
 * Type guard to check if a Result is Ok.
 */
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> =>
  result._tag === "Ok";

/**
 * Type guard to check if a Result is Err.
 */
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> =>
  result._tag === "Err";

/**
 * Extracts the value from an Ok, or returns the default value if Err.
 */
export const getOrElseResult = <T, E>(
  result: Result<T, E>,
  defaultValue: T
): T => (isOk(result) ? result.value : defaultValue);

/**
 * Extracts the value from an Ok, or throws the error if Err.
 */
export const unwrapResult = <T, E>(result: Result<T, E>): T => {
  if (isOk(result)) return result.value;
  throw result.error;
};

/**
 * Maps a function over the value in an Ok, or returns the Err unchanged.
 */
export const mapResult = <T, U, E>(
  result: Result<T, E>,
  f: (value: T) => U
): Result<U, E> => (isOk(result) ? Ok(f(result.value)) : result);

/**
 * Maps a function over the error in an Err, or returns the Ok unchanged.
 */
export const mapError = <T, E, F>(
  result: Result<T, E>,
  f: (error: E) => F
): Result<T, F> => (isErr(result) ? Err(f(result.error)) : result);

/**
 * Chains Result-returning operations.
 */
export const flatMapResult = <T, U, E>(
  result: Result<T, E>,
  f: (value: T) => Result<U, E>
): Result<U, E> => (isOk(result) ? f(result.value) : result);

/**
 * Converts a throwing function into a Result-returning function.
 */
export const tryCatch = <T, E = unknown>(
  fn: () => T,
  onError?: (error: unknown) => E
): Result<T, E> => {
  try {
    return Ok(fn());
  } catch (error) {
    return Err((onError ? onError(error) : error) as E);
  }
};

/**
 * Converts an async throwing function into a Result-returning async function.
 */
export const tryCatchAsync = async <T, E = unknown>(
  fn: () => Promise<T>,
  onError?: (error: unknown) => E
): Promise<Result<T, E>> => {
  try {
    return Ok(await fn());
  } catch (error) {
    return Err((onError ? onError(error) : error) as E);
  }
};

// ============================================================================
// Async variants
// ============================================================================

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
export const mapAsyncOption = async <T, U>(
  opt: AsyncOption<T>,
  f: (value: T) => U | Promise<U>
): AsyncOption<U> => {
  const resolved = await opt;
  if (isSome(resolved)) {
    return Some(await f(resolved.value));
  }
  return None;
};

/**
 * Maps a function over an async Result.
 */
export const mapAsyncResult = async <T, U, E>(
  result: AsyncResult<T, E>,
  f: (value: T) => U | Promise<U>
): AsyncResult<U, E> => {
  const resolved = await result;
  if (isOk(resolved)) {
    return Ok(await f(resolved.value));
  }
  return resolved;
};

// ============================================================================
// Conversion utilities
// ============================================================================

/**
 * Converts an Option to a Result.
 * None becomes Err with the provided error.
 */
export const optionToResult = <T, E>(opt: Option<T>, error: E): Result<T, E> =>
  isSome(opt) ? Ok(opt.value) : Err(error);

/**
 * Converts a Result to an Option.
 * Err becomes None, discarding the error.
 */
export const resultToOption = <T, E>(result: Result<T, E>): Option<T> =>
  isOk(result) ? Some(result.value) : None;

/**
 * Combines multiple Options into an Option of an array.
 * Returns None if any input is None.
 */
export const sequence = <T>(opts: Option<T>[]): Option<T[]> => {
  const values: T[] = [];
  for (const opt of opts) {
    if (isNone(opt)) return None;
    values.push(opt.value);
  }
  return Some(values);
};

/**
 * Combines multiple Results into a Result of an array.
 * Returns the first Err encountered, or Ok with all values.
 */
export const sequenceResults = <T, E>(
  results: Result<T, E>[]
): Result<T[], E> => {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) return result;
    values.push(result.value);
  }
  return Ok(values);
};
