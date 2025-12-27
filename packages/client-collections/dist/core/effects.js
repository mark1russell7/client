/**
 * Functional effect types for error handling and optional values.
 *
 * Provides Option<T> and Result<T,E> types for explicit, type-safe
 * error handling without exceptions. Includes async variants.
 */
/**
 * The singleton None value.
 */
export const None = Object.freeze({ _tag: "None" });
/**
 * Constructs a Some value containing the given value.
 */
export const Some = (value) => Object.freeze({ _tag: "Some", value });
/**
 * Type guard to check if an Option is None.
 */
export const isNone = (opt) => opt._tag === "None";
/**
 * Type guard to check if an Option is Some.
 */
export const isSome = (opt) => opt._tag === "Some";
/**
 * Extracts the value from a Some, or returns the default value if None.
 */
export const getOrElse = (opt, defaultValue) => isSome(opt) ? opt.value : defaultValue;
/**
 * Extracts the value from a Some, or throws an error if None.
 */
export const unwrap = (opt) => {
    if (isSome(opt))
        return opt.value;
    throw new Error("Called unwrap on None");
};
/**
 * Maps a function over the value in a Some, or returns None.
 */
export const mapOption = (opt, f) => (isSome(opt) ? Some(f(opt.value)) : None);
/**
 * Chains Option-returning operations.
 */
export const flatMapOption = (opt, f) => (isSome(opt) ? f(opt.value) : None);
/**
 * Converts a nullable value to an Option.
 */
export const fromNullable = (value) => value == null ? None : Some(value);
/**
 * Converts an Option to a nullable value.
 */
export const toNullable = (opt) => isSome(opt) ? opt.value : undefined;
/**
 * Constructs an Ok result containing the given value.
 */
export const Ok = (value) => Object.freeze({
    _tag: "Ok",
    value,
    match: (f) => f.Ok(value),
});
/**
 * Constructs an Err result containing the given error.
 */
export const Err = (error) => Object.freeze({
    _tag: "Err",
    error,
    match: (f) => f.Err(error),
});
/**
 * Type guard to check if a Result is Ok.
 */
export const isOk = (result) => result._tag === "Ok";
/**
 * Type guard to check if a Result is Err.
 */
export const isErr = (result) => result._tag === "Err";
/**
 * Extracts the value from an Ok, or returns the default value if Err.
 */
export const getOrElseResult = (result, defaultValue) => (isOk(result) ? result.value : defaultValue);
/**
 * Extracts the value from an Ok, or throws the error if Err.
 */
export const unwrapResult = (result) => {
    if (isOk(result))
        return result.value;
    throw result.error;
};
/**
 * Maps a function over the value in an Ok, or returns the Err unchanged.
 */
export const mapResult = (result, f) => (isOk(result) ? Ok(f(result.value)) : result);
/**
 * Maps a function over the error in an Err, or returns the Ok unchanged.
 */
export const mapError = (result, f) => (isErr(result) ? Err(f(result.error)) : result);
/**
 * Chains Result-returning operations.
 */
export const flatMapResult = (result, f) => (isOk(result) ? f(result.value) : result);
/**
 * Converts a throwing function into a Result-returning function.
 */
export const tryCatch = (fn, onError) => {
    try {
        return Ok(fn());
    }
    catch (error) {
        return Err((onError ? onError(error) : error));
    }
};
/**
 * Converts an async throwing function into a Result-returning async function.
 */
export const tryCatchAsync = async (fn, onError) => {
    try {
        return Ok(await fn());
    }
    catch (error) {
        return Err((onError ? onError(error) : error));
    }
};
/**
 * Maps a function over an async Option.
 */
export const mapAsyncOption = async (opt, f) => {
    const resolved = await opt;
    if (isSome(resolved)) {
        return Some(await f(resolved.value));
    }
    return None;
};
/**
 * Maps a function over an async Result.
 */
export const mapAsyncResult = async (result, f) => {
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
export const optionToResult = (opt, error) => isSome(opt) ? Ok(opt.value) : Err(error);
/**
 * Converts a Result to an Option.
 * Err becomes None, discarding the error.
 */
export const resultToOption = (result) => isOk(result) ? Some(result.value) : None;
/**
 * Combines multiple Options into an Option of an array.
 * Returns None if any input is None.
 */
export const sequence = (opts) => {
    const values = [];
    for (const opt of opts) {
        if (isNone(opt))
            return None;
        values.push(opt.value);
    }
    return Some(values);
};
/**
 * Combines multiple Results into a Result of an array.
 * Returns the first Err encountered, or Ok with all values.
 */
export const sequenceResults = (results) => {
    const values = [];
    for (const result of results) {
        if (isErr(result))
            return result;
        values.push(result.value);
    }
    return Ok(values);
};
//# sourceMappingURL=effects.js.map